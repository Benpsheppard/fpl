import pytest
from fastapi.testclient import TestClient

import main
from services import two_stage_model
from services.two_stage_model import train_two_stage_model
from tests.test_predictions_api import payload
from tests.test_two_stage_model import synthetic_training_data

client = TestClient(main.app)

ALLOWED = "http://localhost:5173"


def test_a_page_on_the_vite_dev_server_can_read_predictions():
    response = client.get("/", headers={"Origin": ALLOWED})

    assert response.headers["access-control-allow-origin"] == ALLOWED


@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost:9999"])
def test_other_origins_get_no_access(origin):
    response = client.get("/", headers={"Origin": origin})

    assert "access-control-allow-origin" not in response.headers


def test_a_browser_cannot_even_preflight_training():
    # The preflight a browser sends before a cross-origin POST
    response = client.options(
        "/model/train",
        headers={"Origin": ALLOWED, "Access-Control-Request-Method": "POST"},
    )

    assert response.status_code == 400
    assert response.text == "Disallowed CORS method"
    # The only method a browser is told it may use is GET
    assert response.headers["access-control-allow-methods"] == "GET"


def test_a_browser_can_preflight_a_read():
    response = client.options(
        "/predict",
        headers={"Origin": ALLOWED, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED


def test_origins_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://picker.example , http://localhost:4000")

    from importlib import reload
    reloaded = reload(main)
    try:
        response = TestClient(reloaded.app).get("/", headers={"Origin": "https://picker.example"})
        assert response.headers["access-control-allow-origin"] == "https://picker.example"
        assert "access-control-allow-origin" not in TestClient(reloaded.app).get("/", headers={"Origin": ALLOWED}).headers
    finally:
        monkeypatch.delenv("CORS_ORIGINS")
        reload(main)


def test_predictions_carry_the_injury_news(monkeypatch):
    main_module = main
    bundle = train_two_stage_model(synthetic_training_data())
    monkeypatch.setattr(main_module, "model_bundle", bundle)

    body = payload(5)
    body["context"]["player"]["news"] = "Knee injury - 75% chance of playing"
    monkeypatch.setattr(main_module, "load_prediction_features", lambda player_id: body)
    monkeypatch.setattr(
        two_stage_model, "prepare_prediction_dataframe",
        lambda payloads: synthetic_training_data(seed=3, gameweeks=1, per_gameweek=1).assign(playerId=5, gameweek=10, fixtures_fixturesInGameweek=1),
    )

    assert client.get("/predict/5").json()["news"] == "Knee injury - 75% chance of playing"


def test_news_is_an_empty_string_when_there_is_none(monkeypatch):
    bundle = train_two_stage_model(synthetic_training_data())
    monkeypatch.setattr(main, "model_bundle", bundle)
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: payload(5))
    monkeypatch.setattr(
        two_stage_model, "prepare_prediction_dataframe",
        lambda payloads: synthetic_training_data(seed=3, gameweeks=1, per_gameweek=1).assign(playerId=5, gameweek=10, fixtures_fixturesInGameweek=1),
    )

    assert client.get("/predict/5").json()["news"] == ""
