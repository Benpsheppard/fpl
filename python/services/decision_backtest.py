# decision_backtest.py
#
# Do the model's *differences* between players hold up? The app's advice is a comparison ("sell A, buy B,
# +1.6 points"), so what matters is whether a player the model rates higher really scores more, and by how much.
# For every past gameweek, with the model trained only on earlier ones, take each pair of players in the same
# position and compare the predicted gap with what actually happened.

import logging

import numpy as np

from services.feature_processor import PROBABILITY_COLUMN, fit_two_stage_fold
from services.model_comparison import recent_form

logger = logging.getLogger(__name__)

POSITION_COLUMN = "player_elementType"

# Predicted gaps (in points) grouped for reporting. The last bucket is open-ended.
GAP_EDGES = [0.0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, np.inf]

# "Regulars" are players the model expects to play. Same threshold as the client's rotation-risk flag.
REGULAR_THRESHOLD = 0.6

# A bucket with fewer pairs than this is too thin to base a recommendation on
MIN_PAIRS_FOR_RECOMMENDATION = 200

FORM_COLUMNS = {"recent_last5Gameweeks_totalPoints", "recent_last5Gameweeks_gameweeks"}


def pair_gaps(predicted, actual, groups):
    """Every pair of players in the same group, oriented so the one rated higher comes first.

    Returns (predicted_gap, actual_gap), both measured as first minus second, so a positive actual gap
    means the rated-higher player really did score more. Pairs the rating can't separate are dropped.
    """
    predicted = np.asarray(predicted, dtype=float)
    actual = np.asarray(actual, dtype=float)
    groups = np.asarray(groups)

    predicted_gaps, actual_gaps = [], []

    for group in np.unique(groups):
        members = np.flatnonzero(groups == group)
        if len(members) < 2:
            continue

        first, second = np.triu_indices(len(members), k=1)
        predicted_gap = predicted[members][first] - predicted[members][second]
        actual_gap = actual[members][first] - actual[members][second]

        flip = predicted_gap < 0
        predicted_gap = np.where(flip, -predicted_gap, predicted_gap)
        actual_gap = np.where(flip, -actual_gap, actual_gap)

        keep = predicted_gap > 0
        predicted_gaps.append(predicted_gap[keep])
        actual_gaps.append(actual_gap[keep])

    if not predicted_gaps:
        return np.array([]), np.array([])

    return np.concatenate(predicted_gaps), np.concatenate(actual_gaps)


def _bound(value):
    return None if np.isinf(value) else float(value)


def summarize(predicted_gap, actual_gap, edges=GAP_EDGES):
    """How often the rated-higher player really won, and how much of the predicted gap was real.

    accuracy ignores pairs that tied on actual points (often two players who both got 0).
    slope is the realised gap per predicted point: 1 means gaps are right, 0.5 means they are twice too big.
    """
    predicted_gap = np.asarray(predicted_gap, dtype=float)
    actual_gap = np.asarray(actual_gap, dtype=float)

    if len(predicted_gap) == 0:
        return {"pairs": 0, "accuracy": None, "tie_rate": None, "mean_predicted_gap": None,
                "mean_realised_gap": None, "slope": None, "buckets": []}

    decided = actual_gap != 0
    won = actual_gap > 0

    def accuracy(mask):
        counted = mask & decided
        return float((won & counted).sum() / counted.sum()) if counted.any() else None

    buckets = []
    for low, high in zip(edges[:-1], edges[1:]):
        in_bucket = (predicted_gap >= low) & (predicted_gap < high)
        if not in_bucket.any():
            continue

        buckets.append({
            "from": _bound(low),
            "to": _bound(high),
            "pairs": int(in_bucket.sum()),
            "accuracy": accuracy(in_bucket),
            "mean_predicted_gap": float(predicted_gap[in_bucket].mean()),
            "mean_realised_gap": float(actual_gap[in_bucket].mean()),
        })

    return {
        "pairs": int(len(predicted_gap)),
        "accuracy": accuracy(np.ones(len(predicted_gap), dtype=bool)),
        "tie_rate": float(1 - decided.mean()),
        "mean_predicted_gap": float(predicted_gap.mean()),
        "mean_realised_gap": float(actual_gap.mean()),
        "slope": float((predicted_gap * actual_gap).sum() / (predicted_gap ** 2).sum()),
        "buckets": buckets,
    }


def recommend_minimum_gap(buckets, target_accuracy=0.6, min_pairs=MIN_PAIRS_FOR_RECOMMENDATION):
    """The smallest predicted gap from which every larger gap wins at least target_accuracy of the time.

    Works down from the biggest gaps and stops at the first bucket that falls short. A bucket with too few
    pairs to judge is skipped rather than allowed to decide. None means no gap reached the target.
    """
    threshold = None

    for bucket in reversed(buckets):
        if bucket["pairs"] < min_pairs or bucket["accuracy"] is None:
            continue

        if bucket["accuracy"] < target_accuracy:
            break

        threshold = bucket["from"]

    return threshold


def backtest_decisions(dataframe, start_gameweek=3, end_gameweek=None, target_accuracy=0.6):
    """Score the model's ranking of players, gameweek by gameweek, against what actually happened.

    The model is compared with a plain "average points over the last five games" ranking on the same
    players, so the result says whether the model adds anything to the obvious rule.
    """
    if end_gameweek is None:
        end_gameweek = int(dataframe["gameweek"].max())

    has_form = FORM_COLUMNS <= set(dataframe.columns)
    rankings = ["model"] + (["recent_form"] if has_form else [])
    pairs = {(name, scope): ([], []) for name in rankings for scope in ("all", "regulars")}
    per_gameweek = []

    for gameweek in range(start_gameweek, end_gameweek + 1):
        fold = fit_two_stage_fold(dataframe, gameweek)

        if fold is None:
            logger.info("GW%s: skipped, not enough data", gameweek)
            continue

        index = fold["X_validation"].index
        actual = fold["y_validation"].loc[index].to_numpy(dtype=float)
        positions = dataframe.loc[index, POSITION_COLUMN].to_numpy()
        regular = fold["X_validation"].loc[index, PROBABILITY_COLUMN].to_numpy() >= REGULAR_THRESHOLD

        scores = {"model": fold["predictions"].loc[index].to_numpy()}
        if has_form:
            scores["recent_form"] = recent_form(dataframe.loc[index]).to_numpy()

        record = {"gameweek": gameweek, "players": int(len(index)), "regulars": int(regular.sum())}

        for name, values in scores.items():
            for scope, mask in (("all", np.ones(len(index), dtype=bool)), ("regulars", regular)):
                predicted_gap, actual_gap = pair_gaps(values[mask], actual[mask], positions[mask])
                pairs[(name, scope)][0].append(predicted_gap)
                pairs[(name, scope)][1].append(actual_gap)

                if scope == "regulars":
                    this_week = summarize(predicted_gap, actual_gap)
                    record[f"{name}_accuracy"] = this_week["accuracy"]
                    record[f"{name}_slope"] = this_week["slope"]

        per_gameweek.append(record)

    if not per_gameweek:
        return {"gameweeks": 0}

    def combined(name, scope):
        predicted_gaps, actual_gaps = pairs[(name, scope)]
        return summarize(np.concatenate(predicted_gaps), np.concatenate(actual_gaps))

    results = {name: {scope: combined(name, scope) for scope in ("all", "regulars")} for name in rankings}

    regular_model = results["model"]["regulars"]
    slope = regular_model["slope"]

    summary = {
        "gameweeks": len(per_gameweek),
        **results,
        "per_gameweek": per_gameweek,
        "recommendation": {
            "based_on": "regulars (players the model expects to play)",
            "target_accuracy": target_accuracy,
            "minimum_predicted_gap": recommend_minimum_gap(regular_model["buckets"], target_accuracy),
            # Below 1 means predicted gaps overstate real ones; scaling them by this would be honest
            "shrink_factor": None if slope is None else float(min(1.0, max(0.0, slope))),
        },
    }

    logger.info("decision backtest: model accuracy %s, slope %s", regular_model["accuracy"], slope)

    return summary
