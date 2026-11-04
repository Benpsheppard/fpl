import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from services.dataset_loader import DatasetLoadError
from services.decision_backtest import (
    GAP_EDGES,
    backtest_decisions,
    pair_gaps,
    recommend_minimum_gap,
    summarize,
)
from tests.test_two_stage_model import synthetic_training_data


# --- pair_gaps ---------------------------------------------------------------

def test_pairs_every_two_players_in_a_group_once():
    predicted_gap, actual_gap = pair_gaps([3, 2, 1, 0], [30, 20, 10, 0], ["A"] * 4)

    assert len(predicted_gap) == 6  # 4 players: 4 * 3 / 2 pairs


def test_a_correct_ranking_has_the_gap_in_the_same_direction():
    predicted_gap, actual_gap = pair_gaps([3, 2, 1], [30, 20, 10], ["A"] * 3)

    assert predicted_gap.tolist() == [1, 2, 1]
    assert actual_gap.tolist() == [10, 20, 10]


def test_the_player_rated_higher_comes_first_even_when_listed_second():
    predicted_gap, actual_gap = pair_gaps([1, 3], [10, 5], ["A", "A"])

    # The second player is rated higher (by 2), but scored 5 less: a miss
    assert predicted_gap.tolist() == [2]
    assert actual_gap.tolist() == [-5]


def test_players_are_only_compared_within_their_own_position():
    predicted_gap, _ = pair_gaps([3, 2, 1], [3, 2, 1], ["GK", "GK", "FWD"])

    assert len(predicted_gap) == 1


def test_a_position_with_one_player_gives_no_pairs():
    predicted_gap, actual_gap = pair_gaps([3, 2], [3, 2], ["GK", "FWD"])

    assert len(predicted_gap) == 0 and len(actual_gap) == 0


def test_pairs_the_model_cannot_separate_are_dropped():
    predicted_gap, _ = pair_gaps([2, 2, 1], [9, 1, 5], ["A"] * 3)

    # (player 0, player 1) tie on rating; the other two pairs remain
    assert predicted_gap.tolist() == [1, 1]


def test_predicted_gaps_are_never_negative():
    rng = np.random.default_rng(0)

    predicted_gap, _ = pair_gaps(rng.random(30), rng.random(30), ["A"] * 30)

    assert (predicted_gap > 0).all()


# --- summarize ---------------------------------------------------------------

def test_a_perfect_ranking_always_wins_and_the_gaps_are_exactly_right():
    actual = np.arange(10, dtype=float)
    predicted_gap, actual_gap = pair_gaps(actual, actual, ["A"] * 10)

    result = summarize(predicted_gap, actual_gap)

    assert result["accuracy"] == 1.0
    assert result["slope"] == pytest.approx(1.0)


def test_predictions_that_are_twice_too_big_give_a_slope_of_one_half():
    actual = np.arange(10, dtype=float)
    predicted_gap, actual_gap = pair_gaps(actual * 2, actual, ["A"] * 10)

    assert summarize(predicted_gap, actual_gap)["slope"] == pytest.approx(0.5)


def test_a_backwards_ranking_never_wins():
    actual = np.arange(10, dtype=float)
    predicted_gap, actual_gap = pair_gaps(-actual, actual, ["A"] * 10)

    result = summarize(predicted_gap, actual_gap)

    assert result["accuracy"] == 0.0
    assert result["slope"] < 0


def test_a_ranking_unrelated_to_the_outcome_wins_about_half_the_time():
    rng = np.random.default_rng(1)
    predicted_gap, actual_gap = pair_gaps(rng.random(400), rng.random(400), ["A"] * 400)

    result = summarize(predicted_gap, actual_gap)

    assert result["accuracy"] == pytest.approx(0.5, abs=0.02)
    assert abs(result["slope"]) < 0.1


def test_accuracy_ignores_pairs_that_tied_on_points():
    # 2 wins, 1 loss and 5 ties: 2 of the 3 decided pairs were won
    result = summarize(np.ones(8), np.array([1, 1, -1, 0, 0, 0, 0, 0], dtype=float))

    assert result["accuracy"] == pytest.approx(2 / 3)
    assert result["tie_rate"] == pytest.approx(5 / 8)


def test_when_every_pair_ties_there_is_no_accuracy_to_report():
    result = summarize(np.ones(4), np.zeros(4))

    assert result["accuracy"] is None
    assert result["tie_rate"] == 1.0


def test_an_empty_input_is_reported_as_nothing_rather_than_failing():
    result = summarize([], [])

    assert result["pairs"] == 0
    assert result["accuracy"] is None and result["buckets"] == []


def test_a_gap_exactly_on_a_boundary_belongs_to_the_upper_bucket():
    result = summarize(np.array([0.25, 0.5, 1.0]), np.ones(3))

    starts = [bucket["from"] for bucket in result["buckets"]]
    assert starts == [0.25, 0.5, 1.0]
    assert all(bucket["pairs"] == 1 for bucket in result["buckets"])


def test_the_last_bucket_has_no_upper_limit_and_empty_buckets_are_left_out():
    result = summarize(np.array([0.1, 5.0]), np.ones(2))

    assert [(b["from"], b["to"]) for b in result["buckets"]] == [(0.0, 0.25), (3.0, None)]


def test_every_pair_lands_in_exactly_one_bucket():
    rng = np.random.default_rng(2)
    predicted_gap = rng.random(500) * 5

    result = summarize(predicted_gap, rng.normal(size=500))

    assert sum(bucket["pairs"] for bucket in result["buckets"]) == 500


def test_each_bucket_reports_its_own_realised_gap():
    result = summarize(np.array([0.3, 0.3, 2.5, 2.5]), np.array([1.0, 3.0, 4.0, 6.0]))

    small, large = result["buckets"]
    assert small["mean_realised_gap"] == pytest.approx(2.0)
    assert large["mean_realised_gap"] == pytest.approx(5.0)


def test_the_buckets_are_the_documented_edges():
    assert GAP_EDGES[0] == 0.0 and GAP_EDGES[-1] == np.inf


# --- recommend_minimum_gap ---------------------------------------------------

def bucket(low, accuracy, pairs=1000):
    return {"from": low, "pairs": pairs, "accuracy": accuracy}


def test_recommends_the_smallest_gap_from_which_every_bucket_clears_the_target():
    buckets = [bucket(0.0, 0.50), bucket(0.5, 0.62), bucket(1.0, 0.70), bucket(2.0, 0.80)]

    assert recommend_minimum_gap(buckets, 0.6) == 0.5


def test_stops_at_the_first_bucket_that_falls_short_working_down_from_the_biggest_gaps():
    # A good bucket below a bad one doesn't count: the bad one breaks the run
    buckets = [bucket(0.0, 0.70), bucket(0.5, 0.55), bucket(1.0, 0.65), bucket(2.0, 0.80)]

    assert recommend_minimum_gap(buckets, 0.6) == 1.0


def test_gives_nothing_when_no_gap_reaches_the_target():
    assert recommend_minimum_gap([bucket(0.0, 0.5), bucket(1.0, 0.55)], 0.6) is None


def test_ignores_a_bucket_with_too_few_pairs_to_judge():
    buckets = [bucket(0.0, 0.65), bucket(1.0, 0.0, pairs=10), bucket(2.0, 0.70)]

    assert recommend_minimum_gap(buckets, 0.6) == 0.0


def test_a_bucket_with_no_decided_pairs_is_skipped():
    assert recommend_minimum_gap([bucket(0.0, 0.7), bucket(1.0, None)], 0.6) == 0.0


def test_the_target_can_be_changed():
    buckets = [bucket(0.0, 0.62), bucket(1.0, 0.75)]

    assert recommend_minimum_gap(buckets, 0.6) == 0.0
    assert recommend_minimum_gap(buckets, 0.7) == 1.0


# --- backtest_decisions on data with a known signal --------------------------

def backtest_data(signal=True, form_columns=True, gameweeks=6, per_gameweek=60, seed=0):
    rng = np.random.default_rng(seed)
    df = synthetic_training_data(seed=seed, gameweeks=gameweeks, per_gameweek=per_gameweek)
    df["player_elementType"] = np.tile([1, 2, 3, 4], len(df) // 4 + 1)[: len(df)]

    if signal:
        # Points really do depend on a feature, so a model can rank players
        df["target_totalPoints"] = np.where(df["target_totalMinutes"] > 0, df["brand_new_feature"] * 10, 0.0)

    if form_columns:
        df["recent_last5Gameweeks_gameweeks"] = 5
        df["recent_last5Gameweeks_totalPoints"] = rng.random(len(df)) * 20  # unrelated to the outcome

    return df


@pytest.fixture(scope="module")
def result():
    return backtest_decisions(backtest_data(), start_gameweek=3)


def test_scores_every_gameweek_from_the_start(result):
    assert result["gameweeks"] == 4
    assert [row["gameweek"] for row in result["per_gameweek"]] == [3, 4, 5, 6]


def test_a_model_with_real_signal_ranks_players_better_than_chance(result):
    assert result["model"]["regulars"]["accuracy"] > 0.6
    assert result["model"]["regulars"]["slope"] > 0.3


def test_it_beats_a_baseline_that_has_no_information(result):
    assert result["model"]["regulars"]["accuracy"] > result["recent_form"]["regulars"]["accuracy"] + 0.1
    assert result["recent_form"]["regulars"]["accuracy"] == pytest.approx(0.5, abs=0.1)


def test_reports_all_players_and_the_regulars_separately(result):
    assert result["model"]["all"]["pairs"] >= result["model"]["regulars"]["pairs"] > 0


def test_each_gameweek_records_who_was_ranked(result):
    row = result["per_gameweek"][0]

    assert row["players"] == 60
    assert 0 < row["regulars"] <= 60
    assert {"model_accuracy", "model_slope", "recent_form_accuracy"} <= set(row)


def test_gives_a_recommendation_with_a_shrink_factor_between_zero_and_one(result):
    recommendation = result["recommendation"]

    assert 0.0 <= recommendation["shrink_factor"] <= 1.0
    assert recommendation["target_accuracy"] == 0.6
    assert recommendation["minimum_predicted_gap"] is None or recommendation["minimum_predicted_gap"] >= 0


def test_the_target_accuracy_is_passed_through():
    result = backtest_decisions(backtest_data(), start_gameweek=5, target_accuracy=0.7)

    assert result["recommendation"]["target_accuracy"] == 0.7


def test_works_without_the_columns_the_baseline_needs():
    result = backtest_decisions(backtest_data(form_columns=False), start_gameweek=5)

    assert "recent_form" not in result and "model" in result


def test_reports_nothing_when_no_gameweek_has_enough_data():
    assert backtest_decisions(backtest_data(), start_gameweek=40) == {"gameweeks": 0}


def test_does_not_modify_the_dataframe_it_is_given():
    df = backtest_data()
    before = df.copy()

    backtest_decisions(df, start_gameweek=5)

    assert df.equals(before)


# --- the endpoint -------------------------------------------------------------

client = TestClient(main.app)


def patch_data(monkeypatch, frame):
    monkeypatch.setattr(main, "load_training_dataset", lambda: [])
    monkeypatch.setattr(main, "prepare_training_dataframe", lambda dataset: frame)
    monkeypatch.setattr(main, "add_features", lambda dataframe: dataframe)


def test_the_endpoint_returns_valid_json(monkeypatch):
    patch_data(monkeypatch, backtest_data())

    response = client.get("/dataset/test/backtest?start_gameweek=5")

    assert response.status_code == 200
    body = response.json()
    assert body["gameweeks"] == 2
    assert body["model"]["regulars"]["buckets"][-1]["to"] is None  # the open-ended bucket, as JSON null
    assert "recommendation" in body


def test_the_endpoint_passes_the_target_through(monkeypatch):
    patch_data(monkeypatch, backtest_data())

    body = client.get("/dataset/test/backtest?start_gameweek=5&target_accuracy=0.7").json()

    assert body["recommendation"]["target_accuracy"] == 0.7


@pytest.mark.parametrize("target", ["0.5", "0.4", "1", "1.2", "abc"])
def test_a_target_accuracy_that_makes_no_sense_is_rejected(monkeypatch, target):
    patch_data(monkeypatch, backtest_data())

    assert client.get(f"/dataset/test/backtest?target_accuracy={target}").status_code == 422


def test_the_endpoint_says_so_when_there_is_nothing_to_backtest(monkeypatch):
    patch_data(monkeypatch, backtest_data())

    response = client.get("/dataset/test/backtest?start_gameweek=40")

    assert response.status_code == 422
    assert "enough data" in response.json()["detail"]


def test_the_endpoint_reports_the_data_service_being_down(monkeypatch):
    def fail():
        raise DatasetLoadError("node down")

    monkeypatch.setattr(main, "load_training_dataset", fail)

    assert client.get("/dataset/test/backtest").status_code == 502
