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
    # Present in real data; the model uses them (see difficulty_head.py)
    df["fixtures_isHome"] = rng.integers(0, 2, rows)
    df["fixtures_difficulty"] = rng.integers(1, 6, rows)
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


from services.two_stage_model import MIN_DOUBLE_GAMEWEEK_TRAINING_ROWS, adjust_prediction  # noqa: E402


def test_payload_flattens_the_double_gameweek_fields():
    with open(FIXTURE) as handle:
        payload = json.load(handle)
    payload["features"]["fixtures"].update({"fixturesInGameweek": 2, "secondFixtureIsHome": True, "secondFixtureDifficulty": 4})

    row = prepare_prediction_dataframe([payload]).iloc[0]

    assert row["fixtures_fixturesInGameweek"] == 2
    assert row["fixtures_secondFixtureIsHome"] == 1
    assert row["fixtures_secondFixtureDifficulty"] == 4


def test_classifier_knows_how_many_fixtures_a_gameweek_has():
    assert "fixtures_fixturesInGameweek" in fp.CLASSIFIER_FEATURES


def test_bundle_counts_the_double_gameweek_rows_it_trained_on():
    data = synthetic_training_data()
    data["fixtures_fixturesInGameweek"] = 1
    data.loc[data.index[:30], "fixtures_fixturesInGameweek"] = 2

    assert train_two_stage_model(data)["metadata"]["double_gameweek_training_rows"] == 30


def test_bundle_without_double_gameweek_data_counts_zero(bundle):
    assert bundle["metadata"]["double_gameweek_training_rows"] == 0


def test_normal_gameweek_is_not_adjusted():
    result = adjust_prediction(4.0, 1, 0, None)

    assert result == {"predicted_points": 4.0, "expected_points": 4.0, "double_gameweek_scaled": False}


def test_unseen_double_gameweek_scales_by_fixture_count():
    result = adjust_prediction(4.0, 2, 0, None)

    assert result["predicted_points"] == 8.0
    assert result["double_gameweek_scaled"] is True


def test_double_gameweek_is_trusted_once_the_model_has_seen_enough():
    result = adjust_prediction(4.0, 2, MIN_DOUBLE_GAMEWEEK_TRAINING_ROWS, None)

    assert result["predicted_points"] == 4.0
    assert result["double_gameweek_scaled"] is False


def test_just_below_the_threshold_still_scales():
    assert adjust_prediction(4.0, 2, MIN_DOUBLE_GAMEWEEK_TRAINING_ROWS - 1, None)["double_gameweek_scaled"] is True


def test_availability_weights_expected_points_but_not_predicted_points():
    result = adjust_prediction(6.0, 1, 0, 0.5)

    assert result["predicted_points"] == 6.0
    assert result["expected_points"] == 3.0


def test_a_player_who_will_not_play_has_zero_expected_points():
    assert adjust_prediction(6.0, 1, 0, 0.0)["expected_points"] == 0.0


def test_double_gameweek_scaling_and_availability_combine():
    result = adjust_prediction(3.0, 2, 0, 0.5)

    assert result["predicted_points"] == 6.0
    assert result["expected_points"] == 3.0


def test_unknown_availability_leaves_points_alone():
    assert adjust_prediction(5.0, 1, 500, None)["expected_points"] == 5.0
