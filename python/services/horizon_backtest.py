# horizon_backtest.py
#
# How well does the model forecast further ahead? Looking one gameweek ahead it knows everything up to the
# match. Looking three ahead its picture of a player's form is two gameweeks older, so it should do worse.
# This measures how much worse, on past gameweeks, so the app can say how far to trust a longer forecast.
#
# For a forecast of gameweek t made `horizon` gameweeks ahead, the model may only learn from results up to
# gameweek t - horizon, and the features describe a player as they were then (the Node service builds rows
# that way: GET /api/training/dataset?horizon=N).

import logging

import numpy as np
import pandas as pd

from services.decision_backtest import FORM_COLUMNS, POSITION_COLUMN, REGULAR_THRESHOLD, pair_gaps, summarize
from services.feature_processor import PROBABILITY_COLUMN, fit_two_stage_fold
from services.model_comparison import recent_form
from services.predictor import evaluate_predictions

logger = logging.getLogger(__name__)

RANKINGS = ["per_horizon_model", "shared_model", "recent_form", "train_mean"]


def _score(actual, predicted, groups, regular):
    """Point error, and how often the higher-rated player of a pair really scored more.

    groups says who may be compared with whom: players in the same position in the same gameweek. Comparing
    a player in one gameweek with a player in another isn't a transfer decision, so it must never be a pair.
    """
    errors = evaluate_predictions(pd.Series(actual), pd.Series(predicted))
    decision = summarize(*pair_gaps(predicted[regular], actual[regular], groups[regular]))

    return {
        "mae": float(errors["mae"]),
        "rmse": float(errors["rmse"]),
        "r2": float(errors["r2"]),
        "accuracy": decision["accuracy"],
        "slope": decision["slope"],
        "pairs": decision["pairs"],
    }


def default_start_gameweek(horizons):
    # A forecast `horizon` ahead of gameweek t learns from rows built for that horizon, and the first such
    # rows are for gameweek `horizon`. So the earliest gameweek with anything to learn from is twice that.
    return 2 * max(horizons)


def backtest_horizons(frames, start_gameweek=None, end_gameweek=None):
    """Score forecasts at each horizon on the same gameweeks and the same players.

    frames maps a horizon (1, 2, 3...) to the dataset built for it. Three rankings are compared at each:
    a model trained on that horizon's own rows, the usual next-gameweek model applied to the older
    features, and a plain "average points over the last five games" rule.
    """
    horizons = sorted(frames)
    if 1 not in frames:
        raise ValueError("The horizon 1 dataset is needed: the shared model learns from it")

    if start_gameweek is None:
        start_gameweek = default_start_gameweek(horizons)
    if end_gameweek is None:
        end_gameweek = int(frames[1]["gameweek"].max())

    by_horizon = {}

    for horizon in horizons:
        frame = frames[horizon]
        has_form = FORM_COLUMNS <= set(frame.columns)

        collected = {name: [] for name in RANKINGS}
        actuals, groupings, regulars = [], [], []
        per_gameweek = []

        for gameweek in range(start_gameweek, end_gameweek + 1):
            own = fit_two_stage_fold(frame, gameweek, horizon=horizon)
            if own is None:
                logger.info("horizon %s, GW%s: skipped, not enough data", horizon, gameweek)
                continue

            index = own["X_validation"].index
            actual = own["y_validation"].loc[index].to_numpy(dtype=float)
            position = frame.loc[index, POSITION_COLUMN].to_numpy()
            # Who counts as a regular is decided once, from the horizon's own model, so every ranking is scored on the same players
            regular = own["X_validation"].loc[index, PROBABILITY_COLUMN].to_numpy() >= REGULAR_THRESHOLD

            scores = {"per_horizon_model": own["predictions"].loc[index].to_numpy()}

            if horizon == 1:
                scores["shared_model"] = scores["per_horizon_model"]
            else:
                shared = fit_two_stage_fold(frame, gameweek, horizon=horizon, train_frame=frames[1])
                if shared is None:
                    continue
                scores["shared_model"] = shared["predictions"].loc[index].to_numpy()

            if has_form:
                scores["recent_form"] = recent_form(frame.loc[index]).to_numpy()

            train_mean = float(own["y_train"].mean())
            scores["train_mean"] = np.full(len(index), train_mean)

            # One group per position per gameweek (positions are 1 to 4)
            grouping = gameweek * 10 + position.astype(int)

            record = {"gameweek": gameweek, "players": int(len(index)), "regulars": int(regular.sum())}
            for name, predicted in scores.items():
                collected[name].append(predicted)
                week = _score(actual, predicted, grouping, regular)
                record[f"{name}_accuracy"] = week["accuracy"]
                record[f"{name}_mae"] = week["mae"]

            actuals.append(actual)
            groupings.append(grouping)
            regulars.append(regular)
            per_gameweek.append(record)

        if not per_gameweek:
            continue

        actual = np.concatenate(actuals)
        grouping = np.concatenate(groupings)
        regular = np.concatenate(regulars)

        by_horizon[str(horizon)] = {
            "gameweeks": [row["gameweek"] for row in per_gameweek],
            "validation_rows": int(len(actual)),
            "regulars": int(regular.sum()),
            "rankings": {
                name: _score(actual, np.concatenate(values), grouping, regular)
                for name, values in collected.items()
                if values
            },
            "per_gameweek": per_gameweek,
        }

    if not by_horizon:
        return {"gameweeks": 0}

    logger.info("horizon backtest: horizons %s on gameweeks %s to %s", list(by_horizon), start_gameweek, end_gameweek)

    return {"start_gameweek": start_gameweek, "end_gameweek": end_gameweek, "by_horizon": by_horizon}
