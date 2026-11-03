from services.feature_processor import run_rolling_two_stage_validation, run_rolling_validation
from tests.test_two_stage_model import synthetic_training_data


def test_rolling_validation_scores_each_gameweek_from_the_start_gameweek():
    results = run_rolling_validation(synthetic_training_data(gameweeks=5, per_gameweek=30), start_gameweek=3)

    assert list(results["gameweek"]) == [3, 4, 5]
    assert (results["train_rows"] > 0).all()
    assert results["mae"].notna().all()


def test_rolling_two_stage_validation_scores_each_gameweek():
    results = run_rolling_two_stage_validation(synthetic_training_data(gameweeks=5, per_gameweek=30), start_gameweek=3)

    assert list(results["gameweek"]) == [3, 4, 5]
    # Stage 2 gets the appearance probability as an extra feature
    assert (results["features"] > 0).all()
