import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import main
from services.dataset_loader import DatasetLoadError, load_training_dataset
from services.feature_processor import fit_two_stage_fold, split_training_data
from services.horizon_backtest import backtest_horizons, default_start_gameweek
from tests.test_dataset_loader import FakeResponse, scripted
from tests.test_two_stage_model import synthetic_training_data

# Small on purpose: every test fits models, so a bigger frame makes the suite slow
GAMEWEEKS = 8
PLAYERS = 40


def base_frame(seed=0):
    rng = np.random.default_rng(seed)
    df = synthetic_training_data(seed=seed, gameweeks=GAMEWEEKS, per_gameweek=PLAYERS)
    df["player_elementType"] = np.tile([1, 2, 3, 4], len(df) // 4 + 1)[: len(df)]
    # Points really depend on this one feature
    df["target_totalPoints"] = np.where(df["target_totalMinutes"] > 0, df["brand_new_feature"] * 10, 0.0)
    df["recent_last5Gameweeks_gameweeks"] = 5
    df["recent_last5Gameweeks_totalPoints"] = rng.random(len(df)) * 20  # carries no information
    return df


def frames_with_staleness(horizons=(1, 2, 3), noise_per_horizon=0.4, seed=0):
    """One frame per horizon. The further ahead, the less the feature tells you, as with older form."""
    rng = np.random.default_rng(seed + 1)
    base = base_frame(seed)
    frames = {}

    for horizon in horizons:
        frame = base.copy()
        frame["brand_new_feature"] = base["brand_new_feature"] + rng.normal(0, noise_per_horizon * (horizon - 1), len(base))
        frames[horizon] = frame

    return frames


@pytest.fixture(scope="module")
def result():
    return backtest_horizons(frames_with_staleness(), start_gameweek=6)


# --- split_training_data: what a forecast could learn from ---------------------------------

def make_split_frame(offset=0):
    return pd.DataFrame({"playerId": np.tile([1, 2], 6), "gameweek": np.repeat(np.arange(1, 7), 2), "marker": offset})


def test_by_default_it_learns_from_every_gameweek_before_the_one_predicted():
    train, validation = split_training_data(make_split_frame(), 5)

    assert train["gameweek"].max() == 4
    assert set(validation["gameweek"]) == {5}


def test_a_forecast_made_ahead_cannot_learn_from_the_gameweeks_in_between():
    train, validation = split_training_data(make_split_frame(), 5, train_before=3)

    assert train["gameweek"].max() == 2
    assert set(validation["gameweek"]) == {5}


def test_it_can_learn_from_another_frame_while_predicting_its_own_rows():
    train, validation = split_training_data(make_split_frame(0), 5, train_before=4, train_frame=make_split_frame(7))

    assert set(train["marker"]) == {7}
    assert train["gameweek"].max() == 3
    assert set(validation["marker"]) == {0}


# --- fit_two_stage_fold: the leak guard ---------------------------------------------------

def test_a_forecast_ahead_ignores_results_it_could_not_have_known_yet():
    frame = base_frame()
    altered = frame.copy()
    # Gameweeks 6 and 7 happen after a forecast three gameweeks ahead of gameweek 8 was made
    unknown = altered["gameweek"].isin([6, 7])
    altered.loc[unknown, "target_totalPoints"] = 50.0
    altered.loc[unknown, "target_totalMinutes"] = 90

    before = fit_two_stage_fold(frame, 8, horizon=3)["predictions"]
    after = fit_two_stage_fold(altered, 8, horizon=3)["predictions"]

    np.testing.assert_allclose(before.to_numpy(), after.to_numpy(), atol=1e-9)


def test_but_a_one_gameweek_forecast_does_learn_from_the_gameweek_just_before():
    frame = base_frame()
    altered = frame.copy()
    altered.loc[altered["gameweek"] == 7, "target_totalPoints"] = 50.0

    before = fit_two_stage_fold(frame, 8, horizon=1)["predictions"]
    after = fit_two_stage_fold(altered, 8, horizon=1)["predictions"]

    assert not np.allclose(before.to_numpy(), after.to_numpy())


def test_a_forecast_with_nothing_to_learn_from_is_skipped():
    assert fit_two_stage_fold(base_frame(), 3, horizon=3) is None


# --- backtest_horizons --------------------------------------------------------------------

def test_the_default_start_leaves_room_to_learn_at_the_longest_horizon():
    assert default_start_gameweek([1, 2, 3]) == 6
    assert default_start_gameweek([1]) == 2


def test_every_horizon_is_scored_on_the_same_gameweeks(result):
    gameweeks = [tuple(h["gameweeks"]) for h in result["by_horizon"].values()]

    assert gameweeks == [(6, 7, 8)] * 3


def test_every_ranking_is_scored_on_the_same_players(result):
    for horizon in result["by_horizon"].values():
        assert horizon["validation_rows"] == 3 * PLAYERS
        assert all(row["players"] == PLAYERS for row in horizon["per_gameweek"])


def test_each_horizon_reports_all_the_rankings(result):
    for horizon in result["by_horizon"].values():
        assert set(horizon["rankings"]) == {"per_horizon_model", "shared_model", "recent_form", "train_mean"}


def test_at_horizon_one_the_two_models_are_the_same_model(result):
    one = result["by_horizon"]["1"]["rankings"]

    assert one["per_horizon_model"] == one["shared_model"]


def test_looking_further_ahead_is_worse_when_the_features_get_staler(result):
    accuracy = {h: result["by_horizon"][h]["rankings"]["per_horizon_model"]["accuracy"] for h in ("1", "2", "3")}
    mae = {h: result["by_horizon"][h]["rankings"]["per_horizon_model"]["mae"] for h in ("1", "2", "3")}

    assert accuracy["1"] > accuracy["3"] + 0.05
    assert mae["1"] < mae["3"]


def test_the_model_beats_a_rule_with_no_information_where_it_has_enough_to_learn_from(result):
    # Not at horizon 3: here that leaves a single gameweek (40 rows) to learn from, and it learns nothing
    for horizon in ("1", "2"):
        rankings = result["by_horizon"][horizon]["rankings"]

        assert rankings["per_horizon_model"]["accuracy"] > rankings["recent_form"]["accuracy"] + 0.03


def test_the_model_beats_guessing_the_average_on_point_error(result):
    one = result["by_horizon"]["1"]["rankings"]

    assert one["per_horizon_model"]["mae"] < one["train_mean"]["mae"]


def test_players_are_only_ever_compared_within_their_own_gameweek(result):
    # "Always the average" gives everyone the same rating within a gameweek, so it can't separate any pair.
    # Its average differs from one gameweek to the next, so any pair it did find would be comparing players
    # across gameweeks, which is not a decision anyone makes.
    for horizon in result["by_horizon"].values():
        assert horizon["rankings"]["train_mean"]["pairs"] == 0
        assert horizon["rankings"]["train_mean"]["accuracy"] is None


def test_each_gameweek_is_reported_for_the_spread_between_weeks(result):
    week = result["by_horizon"]["2"]["per_gameweek"][0]

    assert week["gameweek"] == 6
    assert {"per_horizon_model_accuracy", "shared_model_accuracy", "recent_form_accuracy", "per_horizon_model_mae"} <= set(week)


def test_it_works_without_the_columns_the_baseline_needs():
    frames = {h: f.drop(columns=["recent_last5Gameweeks_gameweeks", "recent_last5Gameweeks_totalPoints"]) for h, f in frames_with_staleness((1, 2)).items()}

    rankings = backtest_horizons(frames, start_gameweek=8)["by_horizon"]["2"]["rankings"]

    assert "recent_form" not in rankings and "per_horizon_model" in rankings


def test_it_needs_the_next_gameweek_dataset_because_the_shared_model_learns_from_it():
    frames = frames_with_staleness((2, 3))

    with pytest.raises(ValueError, match="horizon 1"):
        backtest_horizons(frames)


def test_it_reports_nothing_when_no_gameweek_has_enough_data():
    assert backtest_horizons(frames_with_staleness((1, 2)), start_gameweek=40) == {"gameweeks": 0}


def test_it_does_not_modify_the_frames_it_is_given():
    frames = frames_with_staleness((1, 2))
    before = {h: f.copy() for h, f in frames.items()}

    backtest_horizons(frames, start_gameweek=8)

    assert all(frames[h].equals(before[h]) for h in frames)


# --- asking Node for a horizon ------------------------------------------------------------

GOOD = FakeResponse(payload={"rows": 1, "dataset": [{"playerId": 1}]})


def no_sleep(_seconds):
    pass


def test_the_loader_asks_for_a_longer_horizon():
    get = scripted(GOOD)

    load_training_dataset(horizon=3, get=get, sleep=no_sleep)

    assert get.calls[0]["params"] == {"horizon": 3}


def test_the_loader_asks_for_the_usual_dataset_by_default():
    get = scripted(GOOD)

    load_training_dataset(get=get, sleep=no_sleep)

    assert get.calls[0]["params"] == {}


def test_the_loader_can_combine_a_horizon_with_a_last_gameweek():
    get = scripted(GOOD)

    load_training_dataset(max_gameweek=8, horizon=2, get=get, sleep=no_sleep)

    assert get.calls[0]["params"] == {"maxGameweek": 8, "horizon": 2}


# --- the endpoint -------------------------------------------------------------------------

client = TestClient(main.app)


def patch_horizon_data(monkeypatch, horizons=(1, 2)):
    frames = frames_with_staleness(horizons)
    requested = []

    def load(max_gameweek=None, horizon=1, **_):
        requested.append(horizon)
        return horizon

    monkeypatch.setattr(main, "load_training_dataset", load)
    monkeypatch.setattr(main, "prepare_training_dataframe", lambda horizon: frames[horizon])
    monkeypatch.setattr(main, "add_features", lambda frame: frame)

    return requested


def test_the_endpoint_loads_one_dataset_per_horizon_and_returns_valid_json(monkeypatch):
    requested = patch_horizon_data(monkeypatch)

    response = client.get("/dataset/test/horizons?max_horizon=2&start_gameweek=8")

    assert response.status_code == 200
    assert requested == [1, 2]
    body = response.json()
    assert set(body["by_horizon"]) == {"1", "2"}
    assert body["by_horizon"]["2"]["rankings"]["train_mean"]["slope"] is None or isinstance(body["by_horizon"]["2"]["rankings"]["train_mean"]["slope"], float)


@pytest.mark.parametrize("value", ["0", "6", "abc"])
def test_a_horizon_that_makes_no_sense_is_rejected(monkeypatch, value):
    patch_horizon_data(monkeypatch)

    assert client.get(f"/dataset/test/horizons?max_horizon={value}").status_code == 422


def test_the_endpoint_says_so_when_there_is_nothing_to_test(monkeypatch):
    patch_horizon_data(monkeypatch)

    response = client.get("/dataset/test/horizons?max_horizon=2&start_gameweek=40")

    assert response.status_code == 422
    assert "enough data" in response.json()["detail"]


def test_the_endpoint_reports_the_data_service_being_down(monkeypatch):
    def fail(**_):
        raise DatasetLoadError("node down")

    monkeypatch.setattr(main, "load_training_dataset", fail)

    assert client.get("/dataset/test/horizons").status_code == 502


# --- an alternative stage-2 learner ---------------------------------------------------------

class ConstantModel:
    def __init__(self, value):
        self.value = value

    def predict(self, X):
        return np.full(len(X), self.value)


def test_a_different_stage_two_learner_can_be_used():
    seen = {}

    def trainer(X_train, y_train, gameweeks=None):
        seen["rows"] = len(X_train)
        seen["gameweeks"] = sorted(set(gameweeks))
        return ConstantModel(7.5)

    fold = fit_two_stage_fold(base_frame(), 6, train_regressor=trainer)

    assert (fold["predictions"] == 7.5).all()
    assert seen["rows"] > 0


def test_the_learner_is_told_when_each_row_happened_and_only_gets_rows_it_may_learn_from():
    seen = {}

    def trainer(X_train, y_train, gameweeks=None):
        seen["gameweeks"] = set(gameweeks)
        return ConstantModel(0.0)

    fit_two_stage_fold(base_frame(), 7, horizon=3, train_regressor=trainer)

    # A forecast three ahead of gameweek 7 may learn from gameweeks up to 4 (and the first has no out-of-fold probability)
    assert seen["gameweeks"] <= {1, 2, 3, 4}
    assert max(seen["gameweeks"]) == 4


def test_the_learner_gets_the_gameweeks_of_the_other_frame_when_learning_from_it():
    other = base_frame(seed=3)
    other["gameweek"] = other["gameweek"] + 100
    seen = {}

    def trainer(X_train, y_train, gameweeks=None):
        seen["gameweeks"] = set(gameweeks)
        return ConstantModel(0.0)

    # Learning from a frame whose gameweeks are all after the one predicted leaves nothing to learn from
    assert fit_two_stage_fold(base_frame(), 6, train_frame=other, train_regressor=trainer) is None


def test_by_default_the_random_forest_is_used():
    fold = fit_two_stage_fold(base_frame(), 6)

    assert fold["predictions"].nunique() > 5
