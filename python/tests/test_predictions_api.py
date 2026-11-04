import pytest
from fastapi.testclient import TestClient

import main
from services import two_stage_model
from services.dataset_loader import DatasetLoadError
from services.two_stage_model import staleness_warnings, train_two_stage_model
from tests.test_two_stage_model import synthetic_training_data

client = TestClient(main.app)

FRESH = {"dataThroughGameweek": 9, "latestFinishedFixtureGameweek": 9}


def payload(player_id, *, position=3, team=1, price=6.0, chance=1.0, freshness=FRESH):
    return {
        "playerId": player_id,
        "gameweek": 10,
        "context": {
            "player": {"firstName": "First", "secondName": f"Player{player_id}", "webName": f"P{player_id}",
                       "team": team, "elementType": position, "price": price},
            "availability": {"status": "a", "chance": chance, "basis": "next_round", "source": "reported"},
            "freshness": freshness,
        },
    }


@pytest.fixture
def model(monkeypatch):
    bundle = train_two_stage_model(synthetic_training_data())
    monkeypatch.setattr(main, "model_bundle", bundle)
    monkeypatch.setattr(main, "load_model", lambda: (_ for _ in ()).throw(main.ModelNotTrainedError("No trained model found. Train one first.")))

    # One synthetic feature row per payload, in order, so each player gets a different prediction
    def frame(payloads):
        data = synthetic_training_data(seed=11, gameweeks=1, per_gameweek=len(payloads))
        return data.assign(playerId=[p["playerId"] for p in payloads], gameweek=10, fixtures_fixturesInGameweek=1)

    monkeypatch.setattr(two_stage_model, "prepare_prediction_dataframe", frame)
    return bundle


def serve(monkeypatch, players, freshness=FRESH):
    monkeypatch.setattr(main, "load_all_prediction_features", lambda: {"freshness": freshness, "count": len(players), "players": players})


# --- staleness -------------------------------------------------------------

def test_no_warnings_when_everything_is_current():
    assert staleness_warnings({"trained_through_gameweek": 9}, FRESH) == []


def test_warns_when_results_outrun_the_stored_player_data():
    warnings = staleness_warnings({"trained_through_gameweek": 9}, {"dataThroughGameweek": 9, "latestFinishedFixtureGameweek": 10})

    assert [w["code"] for w in warnings] == ["data_stale"]
    assert "Run a sync" in warnings[0]["message"]


def test_warns_when_the_model_is_older_than_the_data():
    warnings = staleness_warnings({"trained_through_gameweek": 8}, FRESH)

    assert [w["code"] for w in warnings] == ["model_stale"]
    assert "gameweek 8" in warnings[0]["message"] and "Retrain" in warnings[0]["message"]


def test_can_be_both_stale():
    warnings = staleness_warnings({"trained_through_gameweek": 7}, {"dataThroughGameweek": 9, "latestFinishedFixtureGameweek": 10})

    assert [w["code"] for w in warnings] == ["data_stale", "model_stale"]


@pytest.mark.parametrize("freshness", [None, {}, {"dataThroughGameweek": None, "latestFinishedFixtureGameweek": None}])
def test_unknown_freshness_gives_no_warnings(freshness):
    assert staleness_warnings({"trained_through_gameweek": 3}, freshness) == []


def test_single_prediction_reports_staleness(monkeypatch, model):
    stale = {"dataThroughGameweek": 10, "latestFinishedFixtureGameweek": 11}
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: payload(player_id, freshness=stale))

    body = client.get("/predict/5").json()

    assert body["data_through_gameweek"] == 10
    assert body["model_trained_through_gameweek"] == 5
    assert sorted(w["code"] for w in body["warnings"]) == ["data_stale", "model_stale"]


def test_single_prediction_has_no_warnings_when_current(monkeypatch, model):
    model["metadata"]["trained_through_gameweek"] = 9
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: payload(player_id))

    assert client.get("/predict/5").json()["warnings"] == []


# --- all players -----------------------------------------------------------

def test_all_players_are_ranked_by_expected_points(monkeypatch, model):
    serve(monkeypatch, [payload(i) for i in range(1, 11)])

    body = client.get("/predict").json()

    assert body["count"] == 10
    scores = [p["expected_points"] for p in body["players"]]
    assert scores == sorted(scores, reverse=True)
    assert {p["playerId"] for p in body["players"]} == set(range(1, 11))


def test_a_player_who_will_not_play_ranks_last(monkeypatch, model):
    players = [payload(i) for i in range(1, 6)] + [payload(99, chance=0.0)]
    serve(monkeypatch, players)

    body = client.get("/predict").json()

    assert body["players"][-1]["playerId"] == 99
    assert body["players"][-1]["expected_points"] == 0.0


def test_each_player_keeps_their_own_adjustments(monkeypatch, model):
    serve(monkeypatch, [payload(1, chance=1.0), payload(2, chance=0.5)])

    by_id = {p["playerId"]: p for p in client.get("/predict").json()["players"]}

    assert by_id[2]["expected_points"] == pytest.approx(by_id[2]["predicted_points"] * 0.5)
    assert by_id[1]["expected_points"] == pytest.approx(by_id[1]["predicted_points"])


def test_players_include_what_a_squad_picker_needs(monkeypatch, model):
    serve(monkeypatch, [payload(7, position=2, team=14, price=5.5)])

    player = client.get("/predict").json()["players"][0]

    assert (player["name"], player["position"], player["team"], player["price"]) == ("P7", 2, 14, 5.5)


def test_limit_trims_the_list_but_count_reports_everyone(monkeypatch, model):
    serve(monkeypatch, [payload(i) for i in range(1, 11)])

    body = client.get("/predict?limit=3").json()

    assert (body["count"], body["returned"], len(body["players"])) == (10, 3, 3)


def test_filter_by_position_team_and_price(monkeypatch, model):
    serve(monkeypatch, [
        payload(1, position=1, team=1, price=4.5),
        payload(2, position=3, team=1, price=8.0),
        payload(3, position=3, team=2, price=6.0),
        payload(4, position=3, team=2, price=None),
    ])

    def ids(query):
        return sorted(p["playerId"] for p in client.get(f"/predict?{query}").json()["players"])

    assert ids("position=3") == [2, 3, 4]
    assert ids("team=2") == [3, 4]
    assert ids("max_price=6") == [1, 3]          # a player with no known price can't fit a budget
    assert ids("position=3&team=2&max_price=7") == [3]


def test_filtering_to_nobody_returns_an_empty_list_without_predicting(monkeypatch, model):
    serve(monkeypatch, [payload(1, position=1)])
    monkeypatch.setattr(two_stage_model, "prepare_prediction_dataframe", lambda payloads: pytest.fail("nothing to predict"))

    body = client.get("/predict?position=4").json()

    assert (body["count"], body["players"]) == (0, [])


def test_all_players_reports_staleness_once(monkeypatch, model):
    serve(monkeypatch, [payload(i) for i in range(1, 4)], freshness={"dataThroughGameweek": 9, "latestFinishedFixtureGameweek": 10})

    body = client.get("/predict").json()

    assert [w["code"] for w in body["warnings"]] == ["data_stale", "model_stale"]
    assert body["data_through_gameweek"] == 9


@pytest.mark.parametrize("query", ["position=0", "position=5", "limit=0", "limit=1001", "max_price=0", "team=0", "position=abc"])
def test_bad_query_parameters_are_rejected(monkeypatch, model, query):
    serve(monkeypatch, [payload(1)])

    assert client.get(f"/predict?{query}").status_code == 422


def test_all_players_without_a_model_is_503(monkeypatch):
    monkeypatch.setattr(main, "model_bundle", None)
    monkeypatch.setattr(main, "load_model", lambda: (_ for _ in ()).throw(main.ModelNotTrainedError("No trained model found. Train one first.")))

    assert client.get("/predict").status_code == 503


def test_all_players_when_node_is_down_is_502(monkeypatch, model):
    def fail():
        raise DatasetLoadError("node down")

    monkeypatch.setattr(main, "load_all_prediction_features", fail)

    assert client.get("/predict").status_code == 502


def test_a_schema_mismatch_asks_for_a_retrain_rather_than_a_500(monkeypatch, model):
    serve(monkeypatch, [payload(1)])

    def mismatch(payloads):
        raise KeyError("fixturesInGameweek")

    monkeypatch.setattr(two_stage_model, "prepare_prediction_dataframe", mismatch)

    response = client.get("/predict")

    assert response.status_code == 409
    assert "Retrain" in response.json()["detail"]


# --- upcoming fixtures ------------------------------------------------------

RUN = {
    "fromGameweek": 10,
    "toGameweek": 14,
    "fixtures": [
        {"gameweek": 10, "opponent": 7, "isHome": True, "difficulty": 2, "played": False},
        {"gameweek": 12, "opponent": 3, "isHome": False, "difficulty": 5, "played": False},
        {"gameweek": 12, "opponent": 9, "isHome": True, "difficulty": 3, "played": False},
    ],
}


def with_run(run):
    body = payload(5)
    body["context"]["upcomingFixtures"] = run
    return body


def test_upcoming_fixtures_are_passed_through_in_the_shape_the_client_reads(monkeypatch, model):
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: with_run(RUN))

    run = client.get("/predict/5").json()["upcoming_fixtures"]

    assert (run["from_gameweek"], run["to_gameweek"]) == (10, 14)
    assert run["fixtures"][0] == {"gameweek": 10, "opponent": 7, "is_home": True, "difficulty": 2, "played": False}
    # A double gameweek stays two entries in the same gameweek, and a blank (11) is simply absent
    assert [(f["gameweek"], f["opponent"]) for f in run["fixtures"]] == [(10, 7), (12, 3), (12, 9)]


def test_a_played_fixture_keeps_its_flag(monkeypatch, model):
    run = {**RUN, "fixtures": [{"gameweek": 10, "opponent": 7, "isHome": True, "difficulty": 2, "played": True}]}
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: with_run(run))

    assert client.get("/predict/5").json()["upcoming_fixtures"]["fixtures"][0]["played"] is True


def test_an_older_node_that_sends_no_fixtures_still_works(monkeypatch, model):
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: payload(5))

    response = client.get("/predict/5")

    assert response.status_code == 200
    assert response.json()["upcoming_fixtures"] is None


def test_a_team_with_nothing_coming_up_has_an_empty_list(monkeypatch, model):
    monkeypatch.setattr(main, "load_prediction_features", lambda player_id: with_run({"fromGameweek": 10, "toGameweek": 14, "fixtures": []}))

    assert client.get("/predict/5").json()["upcoming_fixtures"]["fixtures"] == []


def test_every_player_in_the_ranking_carries_their_fixtures(monkeypatch, model):
    players = [with_run(RUN) | {"playerId": 1}, with_run(RUN) | {"playerId": 2}]
    for body in players:
        body["context"]["player"] = payload(body["playerId"])["context"]["player"]
    serve(monkeypatch, players)

    ranked = client.get("/predict").json()["players"]

    assert len(ranked) == 2
    assert all(len(p["upcoming_fixtures"]["fixtures"]) == 3 for p in ranked)
