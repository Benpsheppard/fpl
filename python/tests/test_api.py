import pytest
from fastapi.testclient import TestClient

import main
from services.dataset_loader import DatasetLoadError, PlayerNotFoundError
from tests.test_two_stage_model import synthetic_training_data
from services.two_stage_model import train_two_stage_model


@pytest.fixture(autouse=True)
def reset_model(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "model_bundle", None)
    # Never touch the real saved model
    monkeypatch.setattr(main, "load_model", lambda: (_ for _ in ()).throw(main.ModelNotTrainedError("No trained model found. Train one first.")))
    monkeypatch.setattr(main, "save_model", lambda bundle: None)


client = TestClient(main.app)

AUTH = {"x-api-key": "test-key"}


@pytest.fixture(autouse=True)
def api_key(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")


def test_predict_without_a_model_is_503():
    response = client.get("/predict/1")

    assert response.status_code == 503
    assert "Train one first" in response.json()["detail"]


def test_model_info_without_a_model_is_503():
    assert client.get("/model").status_code == 503


def test_predict_returns_probability_and_points(monkeypatch):
    bundle = train_two_stage_model(synthetic_training_data())
    monkeypatch.setattr(main, "model_bundle", bundle)
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: {"playerId": player_id, "context": {"player": {"firstName": "Bukayo", "secondName": "Saka", "webName": "Saka"}}})
    monkeypatch.setattr(main, "prepare_prediction_dataframe", lambda payloads: synthetic_training_data(seed=3, gameweeks=1, per_gameweek=1).assign(playerId=payloads[0]["playerId"], gameweek=6))

    response = client.get("/predict/42")

    assert response.status_code == 200
    body = response.json()
    assert body["playerId"] == 42
    assert body["name"] == "Saka"
    assert body["fullName"] == "Bukayo Saka"
    assert body["gameweek"] == 6
    assert 0 <= body["appearance_probability"] <= 1
    assert isinstance(body["predicted_points"], float)
    assert body["model_trained_through_gameweek"] == 5


@pytest.mark.parametrize("error, status", [
    (PlayerNotFoundError("none"), 404),
    (DatasetLoadError("node down"), 502),
])
def test_predict_maps_node_errors(monkeypatch, error, status):
    monkeypatch.setattr(main, "model_bundle", train_two_stage_model(synthetic_training_data()))

    def fail(player_id):
        raise error

    monkeypatch.setattr(main, "load_prediction_features", fail)

    assert client.get("/predict/1").status_code == status


def test_predict_asks_for_retraining_when_features_changed(monkeypatch):
    monkeypatch.setattr(main, "model_bundle", train_two_stage_model(synthetic_training_data()))
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: {})
    monkeypatch.setattr(main, "prepare_prediction_dataframe", lambda payloads: synthetic_training_data(gameweeks=1, per_gameweek=1).drop(columns=["brand_new_feature"]))

    response = client.get("/predict/1")

    assert response.status_code == 409
    assert "Retrain" in response.json()["detail"]


def test_train_stores_the_model_and_returns_metadata(monkeypatch):
    data = synthetic_training_data()
    monkeypatch.setattr(main, "load_training_dataset", lambda: [])
    monkeypatch.setattr(main, "prepare_training_dataframe", lambda dataset: data)
    monkeypatch.setattr(main, "add_features", lambda dataframe: dataframe)

    response = client.post("/model/train", headers=AUTH)

    assert response.status_code == 200
    assert response.json()["trained_through_gameweek"] == 5
    assert main.model_bundle is not None


def test_train_reports_node_failures_as_502(monkeypatch):
    def fail():
        raise DatasetLoadError("node down")

    monkeypatch.setattr(main, "load_training_dataset", fail)

    assert client.post("/model/train", headers=AUTH).status_code == 502
    # The lock must be released after a failure
    assert client.post("/model/train", headers=AUTH).status_code == 502


def test_concurrent_training_is_rejected():
    assert main.training_lock.acquire(blocking=False)
    try:
        assert client.post("/model/train", headers=AUTH).status_code == 409
    finally:
        main.training_lock.release()


def test_predict_still_works_when_node_sends_no_name(monkeypatch):
    monkeypatch.setattr(main, "model_bundle", train_two_stage_model(synthetic_training_data()))
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: {"playerId": player_id})
    monkeypatch.setattr(main, "prepare_prediction_dataframe", lambda payloads: synthetic_training_data(seed=3, gameweeks=1, per_gameweek=1).assign(playerId=payloads[0]["playerId"], gameweek=6))

    body = client.get("/predict/7").json()

    assert body["name"] is None
    assert body["fullName"] is None


def test_train_requires_the_api_key(monkeypatch):
    monkeypatch.setattr(main, "load_training_dataset", lambda: pytest.fail("must not train without a key"))

    assert client.post("/model/train").status_code == 401
    assert client.post("/model/train", headers={"x-api-key": "wrong"}).status_code == 401


def test_train_is_closed_when_no_key_is_configured(monkeypatch):
    monkeypatch.delenv("API_KEY")
    monkeypatch.setattr(main, "load_training_dataset", lambda: pytest.fail("must not train without a key"))

    assert client.post("/model/train", headers=AUTH).status_code == 503
