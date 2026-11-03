import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from services.dataset_loader import DatasetLoadError
from services.model_comparison import MODELS, compare_models, json_safe
from tests.test_two_stage_model import synthetic_training_data


def comparison_data(signal=True):
    df = synthetic_training_data(gameweeks=6, per_gameweek=40)
    # Columns the recent-form benchmark reads
    df["recent_last5Gameweeks_gameweeks"] = 5
    df["recent_last5Gameweeks_totalPoints"] = df["brand_new_feature"] * 20
    if signal:
        # Points really depend on a feature, so a model can beat the train mean
        df["target_totalPoints"] = np.where(df["target_totalMinutes"] > 0, df["brand_new_feature"] * 10, 0.0)
    return df


@pytest.fixture(scope="module")
def result():
    return compare_models(comparison_data(), start_gameweek=3, bootstrap_samples=200)


def test_every_model_is_scored_for_every_gameweek(result):
    per_gameweek, summary = result

    assert summary["gameweeks"] == 4
    assert sorted(per_gameweek["model"].unique()) == sorted(MODELS)
    for gameweek, group in per_gameweek.groupby("gameweek"):
        assert sorted(group["model"]) == sorted(MODELS), gameweek


def test_all_models_are_scored_on_identical_validation_rows(result):
    per_gameweek, _ = result

    for gameweek, group in per_gameweek.groupby("gameweek"):
        assert group["validation_rows"].nunique() == 1, gameweek
        assert group["validation_rows"].iloc[0] == 40


def test_same_rows_baseline_trains_on_exactly_the_two_stage_rows(result):
    per_gameweek, _ = result
    by = per_gameweek.set_index(["gameweek", "model"])["train_rows"]

    for gameweek in per_gameweek["gameweek"].unique():
        assert by[(gameweek, "single_same_rows")] == by[(gameweek, "two_stage")]
        # The full baseline also gets gameweek 1, which the two-stage model cannot use
        assert by[(gameweek, "single_all_rows")] == by[(gameweek, "two_stage")] + 40


def test_models_with_signal_beat_the_constant_baseline(result):
    _, summary = result
    pooled = summary["pooled"]

    assert pooled["single_all_rows"]["mae"] < pooled["train_mean"]["mae"]
    assert pooled["two_stage"]["mae"] < pooled["train_mean"]["mae"]


def test_summary_reports_paired_change_with_an_interval(result):
    _, summary = result
    change = summary["two_stage_mae_change"]

    assert sorted(change) == sorted(m for m in MODELS if m != "two_stage")
    for model, stats in change.items():
        low, high = stats["ci95"]
        assert low <= high
        assert stats["better_in_gameweeks"].count("/") == 1
        assert isinstance(stats["significant"], bool)
    # Beating a constant guess on data with real signal should be clearly significant
    assert change["train_mean"]["mean"] < 0
    assert change["train_mean"]["significant"] is True


def test_bootstrap_is_reproducible_for_a_seed():
    first = compare_models(comparison_data(), start_gameweek=4, bootstrap_samples=100, seed=7)[1]
    second = compare_models(comparison_data(), start_gameweek=4, bootstrap_samples=100, seed=7)[1]

    # approx, not ==: multi-threaded forests differ in the last bit between runs
    assert first["two_stage_mae_change"]["train_mean"]["ci95"] == pytest.approx(second["two_stage_mae_change"]["train_mean"]["ci95"])


def test_does_not_modify_the_input_dataframe():
    df = comparison_data()
    before = df.copy()

    compare_models(df, start_gameweek=5, bootstrap_samples=50)

    assert df.equals(before)


def test_nothing_to_compare_returns_an_empty_result():
    per_gameweek, summary = compare_models(comparison_data(), start_gameweek=20)

    assert per_gameweek.empty
    assert summary == {"gameweeks": 0}


def test_json_safe_replaces_nan_only():
    assert json_safe({"a": float("nan"), "b": [1.5, float("nan")], "c": {"d": 2}}) == {"a": None, "b": [1.5, None], "c": {"d": 2}}


client = TestClient(main.app)


def test_compare_endpoint_returns_valid_json_even_with_undefined_scores(monkeypatch):
    monkeypatch.setattr(main, "load_training_dataset", lambda: [])
    monkeypatch.setattr(main, "prepare_training_dataframe", lambda dataset: comparison_data())
    monkeypatch.setattr(main, "add_features", lambda dataframe: dataframe)

    response = client.get("/dataset/test/compare?start_gameweek=5")

    assert response.status_code == 200
    body = response.json()
    assert body["gameweeks"] == 2
    assert len(body["per_gameweek"]) == 2 * len(MODELS)
    # A constant prediction has no defined rank correlation
    mean_rows = [row for row in body["per_gameweek"] if row["model"] == "train_mean"]
    assert all(row["spearman"] is None for row in mean_rows)


def test_compare_endpoint_errors(monkeypatch):
    def fail():
        raise DatasetLoadError("node down")

    monkeypatch.setattr(main, "load_training_dataset", fail)
    assert client.get("/dataset/test/compare").status_code == 502

    monkeypatch.setattr(main, "load_training_dataset", lambda: [])
    monkeypatch.setattr(main, "prepare_training_dataframe", lambda dataset: comparison_data())
    monkeypatch.setattr(main, "add_features", lambda dataframe: dataframe)
    assert client.get("/dataset/test/compare?start_gameweek=30").status_code == 422
