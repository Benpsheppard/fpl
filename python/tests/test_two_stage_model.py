import json
import os

import numpy as np
import pandas as pd
import pytest

from services import feature_processor as fp
from services.two_stage_model import (
    PROBABILITY_COLUMN,
    ModelNotTrainedError,
    load_model,
    predict_two_stage,
    prepare_prediction_dataframe,
    save_model,
    train_two_stage_model,
)

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "prediction_payload.json")


def synthetic_training_data(seed=0, gameweeks=5, per_gameweek=40):
    rng = np.random.default_rng(seed)
    rows = gameweeks * per_gameweek
    columns = fp.CLASSIFIER_FEATURES + ["brand_new_feature"]
    df = pd.DataFrame(rng.random((rows, len(columns))), columns=columns)
    df["playerId"] = np.tile(np.arange(per_gameweek), gameweeks)
    df["gameweek"] = np.repeat(np.arange(1, gameweeks + 1), per_gameweek)
    df["target_totalMinutes"] = np.where(rng.random(rows) > 0.3, 90, 0)
    df["target_totalPoints"] = np.where(df["target_totalMinutes"] > 0, rng.integers(1, 12, rows), 0)
    return df


@pytest.fixture(scope="module")
def bundle():
    return train_two_stage_model(synthetic_training_data())


def test_bundle_records_what_it_was_trained_on(bundle):
    metadata = bundle["metadata"]

    assert metadata["trained_through_gameweek"] == 5
    assert metadata["rows"] == 200
    # Gameweek 1 has no earlier data to score it, so stage 2 trains without it
    assert metadata["regressor_training_rows"] == 160
    assert PROBABILITY_COLUMN not in bundle["regressor_features"]
    assert not any(c.startswith("target_") for c in bundle["regressor_features"] + bundle["classifier_features"])


def test_predictions_have_probabilities_and_points(bundle):
    new_rows = synthetic_training_data(seed=1, gameweeks=1, per_gameweek=3)
    new_rows["gameweek"] = 6

    result = predict_two_stage(bundle, new_rows)

    assert list(result["playerId"]) == [0, 1, 2]
    assert (result["gameweek"] == 6).all()
    assert result["appearance_probability"].between(0, 1).all()
    assert result["predicted_points"].notna().all()


def test_prediction_fails_clearly_when_features_are_missing(bundle):
    new_rows = synthetic_training_data(seed=1, gameweeks=1, per_gameweek=2).drop(columns=["brand_new_feature"])

    with pytest.raises(ValueError, match="missing model features"):
        predict_two_stage(bundle, new_rows)


def test_model_round_trips_through_disk(bundle, tmp_path):
    path = str(tmp_path / "models" / "model.joblib")
    save_model(bundle, path)
    loaded = load_model(path)

    new_rows = synthetic_training_data(seed=2, gameweeks=1, per_gameweek=4)
    expected = predict_two_stage(bundle, new_rows)
    actual = predict_two_stage(loaded, new_rows)

    np.testing.assert_allclose(actual["predicted_points"], expected["predicted_points"])
    assert not os.path.exists(path + ".tmp")


def test_loading_without_a_model_raises(tmp_path):
    with pytest.raises(ModelNotTrainedError):
        load_model(str(tmp_path / "missing.joblib"))


def test_training_needs_more_than_one_gameweek():
    with pytest.raises(ValueError, match="Not enough gameweeks"):
        train_two_stage_model(synthetic_training_data(gameweeks=1))


def test_node_prediction_payload_flattens_to_model_columns():
    # Payload produced by the Node service (server/tests/predictionFeatures.test.js
    # fails if its shape drifts from this fixture)
    with open(FIXTURE) as handle:
        payload = json.load(handle)

    assert "target" not in payload

    dataframe = prepare_prediction_dataframe([payload])

    assert len(dataframe) == 1
    assert dataframe.loc[0, "gameweek"] == payload["gameweek"]
    assert dataframe.loc[0, "target_totalPoints"] is None or pd.isna(dataframe.loc[0, "target_totalPoints"])
    assert fp.select_classifier_features(dataframe)
    assert fp.select_regressor_features(dataframe)
