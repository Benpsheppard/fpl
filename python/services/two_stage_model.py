# two_stage_model.py
#
# Stage 1 predicts the chance a player appears at all. Stage 2 predicts points
# from the usual features plus that probability. Training uses out-of-fold
# probabilities (each gameweek scored by a classifier that has only seen
# earlier gameweeks) so stage 2 never learns from probabilities that saw the
# answer. At prediction time the classifier is trained on every gameweek.

import os
from datetime import datetime, timezone

import joblib
import pandas as pd

from services.feature_processor import (
    PROBABILITY_COLUMN,
    add_features,
    flatten_training_row,
    select_classifier_features,
    select_regressor_features,
)
from services.difficulty_head import train_regressor_with_difficulty_head
from services.predictor import (
    generate_oof_appearance_probabilities,
    train_random_forest_classifier,
)

MODEL_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "two_stage.joblib"),
)


# A model that has seen fewer double-gameweek rows than this cannot be trusted to price them.
# One double gameweek is roughly 250 player rows, so this asks for about half of one.
MIN_DOUBLE_GAMEWEEK_TRAINING_ROWS = 100


class ModelNotTrainedError(RuntimeError):
    pass


def adjust_prediction(model_points, fixtures_in_gameweek, double_gameweek_training_rows, availability_chance):
    """Turn the model's points into the figures a squad decision needs.

    predicted_points: the model's output. In a double gameweek, if the model has barely
        seen any (it can only learn them once they have been played), it is scaled by the
        number of fixtures instead, since points are roughly additive across fixtures.
    expected_points: predicted_points weighted by the chance of playing (FPL's injury news).
    """
    fixtures = max(1, int(fixtures_in_gameweek))
    scaled = fixtures > 1 and double_gameweek_training_rows < MIN_DOUBLE_GAMEWEEK_TRAINING_ROWS

    predicted_points = model_points * fixtures if scaled else model_points
    expected_points = predicted_points if availability_chance is None else predicted_points * availability_chance

    return {
        "predicted_points": float(predicted_points),
        "expected_points": float(expected_points),
        "double_gameweek_scaled": bool(scaled),
    }


def train_two_stage_model(dataframe):
    classifier_features = select_classifier_features(dataframe)
    regressor_features = select_regressor_features(dataframe)

    oof_probabilities = generate_oof_appearance_probabilities(dataframe, classifier_features)

    # The earliest gameweek has no earlier data to score it, so it has no probability
    usable = oof_probabilities.dropna().index
    if len(usable) == 0:
        raise ValueError("Not enough gameweeks to train: need at least two with both starters and non-starters")

    X_regressor = dataframe.loc[usable, regressor_features].copy()
    X_regressor[PROBABILITY_COLUMN] = oof_probabilities.loc[usable]
    y_regressor = dataframe.loc[usable, "target_totalPoints"]

    classifier = train_random_forest_classifier(
        dataframe[classifier_features],
        (dataframe["target_totalMinutes"] > 0).astype(int),
    )
    regressor = train_regressor_with_difficulty_head(X_regressor, y_regressor, dataframe.loc[usable, "gameweek"])

    return {
        "classifier": classifier,
        "regressor": regressor,
        "classifier_features": classifier_features,
        "regressor_features": regressor_features,
        "metadata": {
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "rows": int(len(dataframe)),
            "regressor_training_rows": int(len(usable)),
            "trained_through_gameweek": int(dataframe["gameweek"].max()),
            "double_gameweek_training_rows": (
                int((dataframe["fixtures_fixturesInGameweek"] > 1).sum())
                if "fixtures_fixturesInGameweek" in dataframe.columns else 0
            ),
            "classifier_feature_count": len(classifier_features),
            "regressor_feature_count": len(regressor_features) + 1,
        },
    }


def save_model(bundle, path=None):
    path = path or MODEL_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Write then rename so a crash mid-save can't leave a half-written model
    temporary_path = f"{path}.tmp"
    joblib.dump(bundle, temporary_path)
    os.replace(temporary_path, path)


def load_model(path=None):
    path = path or MODEL_PATH

    if not os.path.exists(path):
        raise ModelNotTrainedError("No trained model found. Train one first.")

    return joblib.load(path)


def prepare_prediction_dataframe(prediction_payloads):
    """Turn Node prediction payloads into the same columns training used."""
    rows = [flatten_training_row(payload) for payload in prediction_payloads]

    return add_features(pd.DataFrame(rows))


def predict_two_stage(bundle, dataframe):
    missing = [
        column
        for column in bundle["classifier_features"] + bundle["regressor_features"]
        if column not in dataframe.columns
    ]
    if missing:
        raise ValueError(f"Prediction data is missing model features: {missing[:5]}")

    probabilities = bundle["classifier"].predict_proba(dataframe[bundle["classifier_features"]])[:, 1]

    X_regressor = dataframe[bundle["regressor_features"]].copy()
    X_regressor[PROBABILITY_COLUMN] = probabilities

    points = bundle["regressor"].predict(X_regressor)

    return pd.DataFrame({
        "playerId": dataframe["playerId"].to_numpy(),
        "gameweek": dataframe["gameweek"].to_numpy(),
        "appearance_probability": probabilities,
        "predicted_points": points,
    })


def staleness_warnings(metadata, freshness):
    """Say so when the data or the model is behind, instead of predicting quietly from old information.

    freshness comes from the Node service: the last gameweek with stored player data, and the last
    gameweek with a finished fixture. A stale fixture list can't be detected from here.
    """
    freshness = freshness or {}
    data_through = freshness.get("dataThroughGameweek")
    latest_finished = freshness.get("latestFinishedFixtureGameweek")
    trained_through = metadata.get("trained_through_gameweek")

    warnings = []

    if data_through is not None and latest_finished is not None and latest_finished > data_through:
        warnings.append({
            "code": "data_stale",
            "message": (
                f"Fixtures show gameweek {latest_finished} has results, but player data only goes to "
                f"gameweek {data_through}. Run a sync."
            ),
        })

    if data_through is not None and trained_through is not None and trained_through < data_through:
        warnings.append({
            "code": "model_stale",
            "message": (
                f"The model was trained through gameweek {trained_through}, but player data goes to "
                f"gameweek {data_through}. Retrain the model."
            ),
        })

    return warnings


def format_upcoming_fixtures(run):
    """The next few gameweeks' fixtures as the client wants them, or None if Node didn't send any."""
    if not run:
        return None

    return {
        "from_gameweek": run.get("fromGameweek"),
        "to_gameweek": run.get("toGameweek"),
        "fixtures": [
            {
                "gameweek": fixture["gameweek"],
                "opponent": fixture["opponent"],
                "is_home": fixture["isHome"],
                "difficulty": fixture["difficulty"],
                "played": fixture.get("played", False),
            }
            for fixture in run.get("fixtures", [])
        ],
    }


def build_prediction(bundle, payload, features_row, result):
    """One player's response: the model's figure, then each adjustment applied to it."""
    context = payload.get("context") or {}
    name = context.get("player") or {}
    availability = context.get("availability") or {}
    chance = availability.get("chance")
    fixtures_in_gameweek = int(features_row.get("fixtures_fixturesInGameweek", 1))
    double_gameweek_rows = bundle["metadata"].get("double_gameweek_training_rows", 0)

    adjusted = adjust_prediction(float(result["predicted_points"]), fixtures_in_gameweek, double_gameweek_rows, chance)
    appearance_probability = float(result["appearance_probability"])

    return {
        "playerId": int(result["playerId"]),
        "name": name.get("webName"),
        "fullName": " ".join(part for part in (name.get("firstName"), name.get("secondName")) if part) or None,
        "team": name.get("team"),
        "position": name.get("elementType"),
        "price": name.get("price"),
        # FPL's note on injuries and availability, shown next to a flagged player
        "news": name.get("news") or "",
        "upcoming_fixtures": format_upcoming_fixtures(context.get("upcomingFixtures")),
        "gameweek": int(result["gameweek"]),

        # What to rank by: the model's figure, adjusted for a double gameweek and for injury news
        "expected_points": adjusted["expected_points"],
        "predicted_points": adjusted["predicted_points"],
        "model_points": float(result["predicted_points"]),

        "appearance_probability": appearance_probability,
        "adjusted_appearance_probability": appearance_probability if chance is None else appearance_probability * chance,

        "fixtures_in_gameweek": fixtures_in_gameweek,
        "adjustments": {
            "double_gameweek": {
                "fixtures": fixtures_in_gameweek,
                "scaled_by_fixture_count": adjusted["double_gameweek_scaled"],
                "model_training_rows": double_gameweek_rows,
            },
            "availability": {
                "status": availability.get("status"),
                "chance": chance,
                "basis": availability.get("basis", "none"),
                "source": availability.get("source", "none"),
            },
        },
    }


def forecast_outlook(bundle, payloads, predictions):
    """Add each player's expected points over a window of gameweeks to their prediction.

    Each later gameweek is predicted from a row that only knows what was known before the first one,
    exactly as the model saw its training rows for that horizon. Injury news only exists for the coming
    round, so later gameweeks carry none: a player who is out now is still priced as fit later on.
    """
    later = [
        (index, {"playerId": payload["playerId"], "gameweek": row["gameweek"], "features": row["features"]})
        for index, payload in enumerate(payloads)
        for row in (payload.get("horizon") or {}).get("later", [])
    ]
    later_predictions = {}

    if later:
        frame = prepare_prediction_dataframe([row for _, row in later])
        results = predict_two_stage(bundle, frame)
        double_gameweek_rows = bundle["metadata"].get("double_gameweek_training_rows", 0)

        for position, (index, _) in enumerate(later):
            fixtures = int(frame.iloc[position].get("fixtures_fixturesInGameweek", 1))
            adjusted = adjust_prediction(float(results.iloc[position]["predicted_points"]), fixtures, double_gameweek_rows, None)
            later_predictions.setdefault(index, []).append({
                "gameweek": int(results.iloc[position]["gameweek"]),
                "expected_points": adjusted["expected_points"],
                "fixtures_in_gameweek": fixtures,
            })

    for index, (payload, prediction) in enumerate(zip(payloads, predictions)):
        window = payload.get("horizon")
        if not window:
            continue

        gameweeks = [
            {
                "gameweek": prediction["gameweek"],
                "expected_points": prediction["expected_points"],
                "fixtures_in_gameweek": prediction["fixtures_in_gameweek"],
            }
        ] if prediction["gameweek"] <= window["toGameweek"] else []
        gameweeks += sorted(later_predictions.get(index, []), key=lambda row: row["gameweek"])

        prediction["outlook"] = {
            "from_gameweek": window["fromGameweek"],
            "to_gameweek": window["toGameweek"],
            "gameweeks": gameweeks,
            "total_expected_points": float(sum(row["expected_points"] for row in gameweeks)),
        }


def predict_payloads(bundle, payloads):
    """Predict many players with one pass through the model."""
    if not payloads:
        return []

    frame = prepare_prediction_dataframe(payloads)
    results = predict_two_stage(bundle, frame)

    predictions = [
        build_prediction(bundle, payloads[i], frame.iloc[i], results.iloc[i])
        for i in range(len(payloads))
    ]
    forecast_outlook(bundle, payloads, predictions)

    return predictions
