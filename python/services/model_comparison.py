# model_comparison.py
#
# Fair comparison of the single-stage and two-stage models. For each validation
# gameweek, every model predicts exactly the same players, and the single-stage
# model is also scored when trained on exactly the rows the two-stage model used
# (the two-stage model cannot use the earliest gameweeks, which have no
# out-of-fold appearance probability).

import logging

import numpy as np
import pandas as pd

from services.feature_processor import PROBABILITY_COLUMN, fit_two_stage_fold, prepare_model_data
from services.predictor import evaluate_predictions, train_random_forest_model

logger = logging.getLogger(__name__)

MODELS = ["two_stage", "single_same_rows", "single_all_rows", "recent_form", "train_mean"]

TOP_N = 20


def _recent_form(dataframe):
    """Points per gameweek over the last five: what you'd guess without a model."""
    played = dataframe["recent_last5Gameweeks_gameweeks"].replace(0, np.nan)

    return (dataframe["recent_last5Gameweeks_totalPoints"] / played).fillna(0)


def _score(y_actual, predictions):
    scores = evaluate_predictions(y_actual, predictions)

    # How well the model ranks players, which is what picking a squad depends on
    top = min(TOP_N, len(y_actual))
    top_players = pd.Series(predictions, index=y_actual.index).nlargest(top).index

    predicted = pd.Series(predictions, index=y_actual.index)

    # A constant prediction (e.g. the training mean) has no defined rank correlation
    scores["spearman"] = float(predicted.corr(y_actual, method="spearman")) if predicted.nunique() > 1 else float("nan")
    scores["top_n_actual"] = float(y_actual.loc[top_players].mean())

    return scores


def json_safe(value):
    """Replace NaN (e.g. rank correlation of a constant prediction) with None; JSON has no NaN."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, float) and value != value:
        return None
    return value


def compare_models(dataframe, start_gameweek=3, end_gameweek=None, bootstrap_samples=1000, seed=0):
    """Score every model on identical validation rows, gameweek by gameweek.

    Returns (per_gameweek, summary). per_gameweek has one row per model per
    gameweek. summary has pooled scores and, for two_stage minus each other
    model, the change in mean absolute error with a 95% bootstrap interval over
    validation rows (negative means two_stage is better).
    """
    if end_gameweek is None:
        end_gameweek = int(dataframe["gameweek"].max())

    has_form = {"recent_last5Gameweeks_totalPoints", "recent_last5Gameweeks_gameweeks"} <= set(dataframe.columns)

    rows = []
    pooled = {model: [] for model in MODELS}
    actuals = []

    for gameweek in range(start_gameweek, end_gameweek + 1):
        fold = fit_two_stage_fold(dataframe, gameweek)

        if fold is None:
            logger.info("GW%s: skipped, not enough data", gameweek)
            continue

        y_validation = fold["y_validation"]
        index = fold["X_validation"].index
        plain_columns = [c for c in fold["X_train"].columns if c != PROBABILITY_COLUMN]

        # Single-stage trained on the very rows the two-stage regressor used
        same_rows = train_random_forest_model(fold["X_train"][plain_columns], fold["y_train"])

        # Single-stage trained on everything available before this gameweek
        X_all, y_all, X_validation_all, _, _ = prepare_model_data(dataframe, gameweek)
        all_rows = train_random_forest_model(X_all, y_all)

        predictions = {
            "two_stage": fold["predictions"].loc[index].to_numpy(),
            "single_same_rows": same_rows.predict(fold["X_validation"][plain_columns]),
            "single_all_rows": all_rows.predict(X_validation_all.loc[index]),
            "train_mean": np.full(len(index), float(fold["y_train"].mean())),
        }
        if has_form:
            predictions["recent_form"] = _recent_form(dataframe.loc[index]).to_numpy()

        for model, predicted in predictions.items():
            scores = _score(y_validation, predicted)
            rows.append({
                "gameweek": gameweek,
                "model": model,
                "train_rows": len(fold["X_train"]) if model != "single_all_rows" else len(X_all),
                "validation_rows": len(index),
                **scores,
            })
            pooled[model].append(np.asarray(predicted, dtype=float))

        actuals.append(y_validation.to_numpy(dtype=float))

    per_gameweek = pd.DataFrame(rows)

    if per_gameweek.empty:
        return per_gameweek, {"gameweeks": 0}

    actual = np.concatenate(actuals)
    pooled = {model: np.concatenate(parts) for model, parts in pooled.items() if parts}

    summary = {
        "gameweeks": int(per_gameweek["gameweek"].nunique()),
        "validation_rows": int(len(actual)),
        "pooled": {
            model: {
                "mae": float(np.mean(np.abs(actual - predicted))),
                "rmse": float(np.sqrt(np.mean((actual - predicted) ** 2))),
            }
            for model, predicted in pooled.items()
        },
        "average_by_gameweek": (
            per_gameweek.groupby("model")[["mae", "rmse", "r2", "spearman", "top_n_actual"]].mean().to_dict("index")
        ),
        "two_stage_mae_change": {},
    }

    # Paired bootstrap over validation rows: resample players, compare errors on the same players
    rng = np.random.default_rng(seed)
    two_stage_error = np.abs(actual - pooled["two_stage"])

    for model, predicted in pooled.items():
        if model == "two_stage":
            continue

        difference = two_stage_error - np.abs(actual - predicted)
        resamples = rng.integers(0, len(difference), size=(bootstrap_samples, len(difference)))
        means = difference[resamples].mean(axis=1)

        # Folds where two_stage had the lower MAE
        wins = 0
        compared = 0
        for _, group in per_gameweek.groupby("gameweek"):
            by_model = group.set_index("model")["mae"]
            if model in by_model and "two_stage" in by_model:
                compared += 1
                wins += int(by_model["two_stage"] < by_model[model])

        low, high = np.percentile(means, [2.5, 97.5])
        summary["two_stage_mae_change"][model] = {
            "mean": float(difference.mean()),
            "ci95": [float(low), float(high)],
            "better_in_gameweeks": f"{wins}/{compared}",
            "significant": bool(low > 0 or high < 0),
        }

    logger.info("\n=== MODEL COMPARISON (identical validation rows) ===")
    logger.info(per_gameweek.round(3).to_string(index=False))

    return per_gameweek, summary
