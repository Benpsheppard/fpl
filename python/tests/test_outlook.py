import pytest
from fastapi.testclient import TestClient

import main
from services import two_stage_model
from services.two_stage_model import predict_payloads, train_two_stage_model
from tests.test_two_stage_model import synthetic_training_data

client = TestClient(main.app)


@pytest.fixture(scope="module")
def trained():
    return train_two_stage_model(synthetic_training_data())


@pytest.fixture(autouse=True)
def stub_features(monkeypatch):
    """One synthetic feature row per payload, in order. A payload's `fixtures` says how many matches that row has."""
    def frame(payloads):
        data = synthetic_training_data(seed=11, gameweeks=1, per_gameweek=len(payloads))
        return data.assign(
            playerId=[p["playerId"] for p in payloads],
            gameweek=[p["gameweek"] for p in payloads],
            fixtures_fixturesInGameweek=[p.get("fixtures", 1) for p in payloads],
        )

    monkeypatch.setattr(two_stage_model, "prepare_prediction_dataframe", frame)


def payload(player_id=1, gameweek=10, later=(), to_gameweek=12, chance=None, with_horizon=True):
    result = {
        "playerId": player_id,
        "gameweek": gameweek,
        "features": {},
        "context": {"availability": {"chance": chance}},
    }
    if with_horizon:
        result["horizon"] = {
            "fromGameweek": 10,
            "toGameweek": to_gameweek,
            "later": [{"gameweek": g, "features": {}} for g in later],
        }
    return result


def test_without_a_horizon_there_is_no_outlook(trained):
    [prediction] = predict_payloads(trained, [payload(with_horizon=False)])

    assert "outlook" not in prediction


def test_the_outlook_adds_up_each_gameweek_in_the_window(trained):
    [prediction] = predict_payloads(trained, [payload(later=[11, 12])])
    outlook = prediction["outlook"]

    assert [row["gameweek"] for row in outlook["gameweeks"]] == [10, 11, 12]
    assert outlook["gameweeks"][0]["expected_points"] == prediction["expected_points"]
    assert outlook["total_expected_points"] == pytest.approx(sum(row["expected_points"] for row in outlook["gameweeks"]))
    assert (outlook["from_gameweek"], outlook["to_gameweek"]) == (10, 12)


def test_a_player_with_no_later_fixtures_only_counts_the_first(trained):
    [prediction] = predict_payloads(trained, [payload(later=[])])

    assert [row["gameweek"] for row in prediction["outlook"]["gameweeks"]] == [10]
    assert prediction["outlook"]["total_expected_points"] == pytest.approx(prediction["expected_points"])


def test_a_first_fixture_outside_the_window_is_not_counted(trained):
    # A blank gameweek 10 and 11: the first fixture is in gameweek 12 but the window ended at 11
    [prediction] = predict_payloads(trained, [payload(gameweek=12, later=[], to_gameweek=11)])

    assert prediction["outlook"]["gameweeks"] == []
    assert prediction["outlook"]["total_expected_points"] == 0.0


def test_injury_news_only_reduces_the_coming_gameweek(trained):
    [fit] = predict_payloads(trained, [payload(later=[11], chance=1.0)])
    [out] = predict_payloads(trained, [payload(later=[11], chance=0.0)])

    assert out["outlook"]["gameweeks"][0]["expected_points"] == 0
    # FPL publishes no news for later rounds, so the later gameweek is the same either way
    assert out["outlook"]["gameweeks"][1]["expected_points"] == pytest.approx(fit["outlook"]["gameweeks"][1]["expected_points"])


def test_a_double_gameweek_the_model_has_not_seen_is_scaled_in_a_later_gameweek(trained):
    plain = payload(later=[11])
    plain["horizon"]["later"][0]["fixtures"] = 1
    double = payload(later=[11])

    # The stub reads the match count from the payload dict being flattened, i.e. the later row
    original = two_stage_model.prepare_prediction_dataframe

    def frame(payloads):
        data = original(payloads)
        data["fixtures_fixturesInGameweek"] = [2 if p["gameweek"] == 11 else 1 for p in payloads]
        return data

    two_stage_model.prepare_prediction_dataframe = frame
    try:
        [scaled] = predict_payloads(trained, [double])
    finally:
        two_stage_model.prepare_prediction_dataframe = original
    [unscaled] = predict_payloads(trained, [plain])

    assert scaled["outlook"]["gameweeks"][1]["expected_points"] == pytest.approx(2 * unscaled["outlook"]["gameweeks"][1]["expected_points"])
    assert scaled["outlook"]["gameweeks"][1]["fixtures_in_gameweek"] == 2


def test_each_player_gets_their_own_later_rows(trained):
    predictions = predict_payloads(trained, [payload(1, later=[11, 12]), payload(2, later=[]), payload(3, later=[12])])

    assert [len(p["outlook"]["gameweeks"]) for p in predictions] == [3, 1, 2]


# --- the endpoint ------------------------------------------------------------

@pytest.fixture
def serve(monkeypatch, trained):
    monkeypatch.setattr(main, "model_bundle", trained)
    calls = []

    def loader(*args):
        calls.append(args)
        # Different numbers of later fixtures, so a player's total over the window differs from their first gameweek
        players = [
            {**payload(i, later=list(range(11, 11 + i % 3 * 1)), to_gameweek=14), "context": {"player": {"elementType": 3, "team": i, "price": 5.0}, "availability": {}}}
            for i in range(1, 9)
        ]
        return {"freshness": {"dataThroughGameweek": 9, "latestFinishedFixtureGameweek": 9}, "count": len(players), "players": players}

    monkeypatch.setattr(main, "load_all_prediction_features", loader)
    return calls


def test_a_horizon_is_passed_to_node_and_returned(serve):
    body = client.get("/predict?horizon=3").json()

    assert serve == [(3,)]
    assert body["horizon"] == 3
    assert "outlook" in body["players"][0]


def test_the_default_horizon_asks_node_for_nothing_extra(serve):
    body = client.get("/predict").json()

    assert serve == [()]
    assert body["horizon"] == 1


def test_players_are_ranked_by_their_total_over_the_window(serve):
    players = client.get("/predict?horizon=3").json()["players"]
    totals = [p["outlook"]["total_expected_points"] for p in players]

    assert totals == sorted(totals, reverse=True)


@pytest.mark.parametrize("bad", ["0", "6", "abc"])
def test_a_bad_horizon_is_rejected(serve, bad):
    assert client.get(f"/predict?horizon={bad}").status_code == 422
