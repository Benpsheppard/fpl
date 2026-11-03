import pytest
import requests

import refresh as refresh_script
from refresh import RefreshError, read_api_key, refresh


@pytest.fixture(autouse=True)
def no_real_requests(monkeypatch):
    """These tests drive a script that can start syncs on the running services. Make that impossible."""
    def refuse(*args, **kwargs):
        raise AssertionError(f"a test tried to make a real request: {args[:1]}")

    monkeypatch.setattr(requests, "post", refuse)
    monkeypatch.setattr(requests, "get", refuse)


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


def recorder(responses):
    calls = []

    def post(url, headers=None, timeout=None):
        calls.append({"url": url, "key": (headers or {}).get("x-api-key"), "timeout": timeout})
        response = responses.get(url.rsplit("/", 1)[-1], FakeResponse())
        if isinstance(response, Exception):
            raise response
        return response

    post.calls = calls
    return post


OK = {
    "sync-all-players": FakeResponse(payload={"totalPlayers": 3, "successful": 3, "failed": 0, "errors": []}),
    "train": FakeResponse(payload={"trained_through_gameweek": 10, "rows": 6000}),
}


def urls(post):
    return [call["url"].split(":", 2)[-1] for call in post.calls]


def test_syncs_in_order_then_trains():
    post = recorder(OK)

    summary = refresh("k", "http://node", "http://py", post=post, log=lambda _: None)

    assert [c["url"] for c in post.calls] == [
        "http://node/api/fpl/sync-bootstrap",
        "http://node/api/fpl/sync-fixtures",
        "http://node/api/fpl/sync-all-players",
        "http://py/model/train",
    ]
    assert summary["model"]["trained_through_gameweek"] == 10
    assert summary["sync"]["failed"] == 0


def test_sends_the_api_key_on_every_request():
    post = recorder(OK)

    refresh("secret", "http://node", "http://py", post=post, log=lambda _: None)

    assert {c["key"] for c in post.calls} == {"secret"}


def test_skip_sync_only_trains():
    post = recorder(OK)

    refresh("k", "http://node", "http://py", post=post, log=lambda _: None, skip_sync=True)

    assert [c["url"] for c in post.calls] == ["http://py/model/train"]


@pytest.mark.parametrize("failing_step", ["sync-bootstrap", "sync-fixtures", "sync-all-players"])
def test_does_not_train_if_a_sync_step_fails(failing_step):
    post = recorder({**OK, failing_step: FakeResponse(status_code=500, text="boom")})

    with pytest.raises(RefreshError, match="500"):
        refresh("k", "http://node", "http://py", post=post, log=lambda _: None)

    assert not any(c["url"].endswith("/model/train") for c in post.calls)


def test_a_sync_already_running_is_explained():
    post = recorder({**OK, "sync-bootstrap": FakeResponse(status_code=409)})

    with pytest.raises(RefreshError, match="already in progress"):
        refresh("k", "http://node", "http://py", post=post, log=lambda _: None)


def test_a_rejected_key_is_explained():
    post = recorder({**OK, "sync-bootstrap": FakeResponse(status_code=401)})

    with pytest.raises(RefreshError, match="API key"):
        refresh("k", "http://node", "http://py", post=post, log=lambda _: None)


def test_an_unreachable_service_is_explained():
    post = recorder({**OK, "sync-bootstrap": requests.ConnectionError("refused")})

    with pytest.raises(RefreshError, match="Could not reach"):
        refresh("k", "http://node", "http://py", post=post, log=lambda _: None)


def test_partial_sync_failures_are_reported_but_the_model_still_trains(monkeypatch, capsys):
    post = recorder({**OK, "sync-all-players": FakeResponse(payload={"totalPlayers": 3, "successful": 2, "failed": 1, "errors": [{"playerId": 7}]})})
    monkeypatch.setattr(refresh_script.requests, "post", post)
    monkeypatch.setattr(refresh_script, "read_api_key", lambda: "k")

    code = refresh_script.main([])

    assert code == refresh_script.EXIT_PARTIAL_SYNC
    assert post.calls[-1]["url"].endswith("/model/train")
    assert "1 players failed" in capsys.readouterr().err


def test_main_exits_cleanly_on_success_and_with_an_error_code_on_failure(monkeypatch):
    monkeypatch.setattr(refresh_script, "read_api_key", lambda: "k")

    monkeypatch.setattr(refresh_script.requests, "post", recorder(OK))
    assert refresh_script.main([]) == refresh_script.EXIT_OK

    monkeypatch.setattr(refresh_script.requests, "post", recorder({**OK, "sync-fixtures": FakeResponse(status_code=500)}))
    assert refresh_script.main([]) == refresh_script.EXIT_ERROR


def test_api_key_from_the_environment_wins(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("API_KEY=from-file\n")

    assert read_api_key({"API_KEY": "from-env"}, str(env_file)) == "from-env"


def test_api_key_falls_back_to_the_server_env_file(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text('PORT = 8000\nAPI_KEY = "abc123"\nOTHER=1\n')

    assert read_api_key({}, str(env_file)) == "abc123"


def test_a_missing_api_key_is_an_error(tmp_path):
    with pytest.raises(RefreshError, match="No API key"):
        read_api_key({}, str(tmp_path / "missing.env"))
