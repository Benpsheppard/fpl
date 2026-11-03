import pytest
import requests

from services.dataset_loader import DatasetLoadError, load_training_dataset


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


def scripted(*outcomes):
    calls = []

    def get(url, params=None, timeout=None):
        calls.append({"url": url, "params": params, "timeout": timeout})
        outcome = outcomes[min(len(calls), len(outcomes)) - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    get.calls = calls
    return get


def no_sleep(_seconds):
    pass


GOOD = FakeResponse(payload={"rows": 1, "dataset": [{"playerId": 1}]})


def test_returns_the_dataset_and_sends_a_timeout():
    get = scripted(GOOD)

    assert load_training_dataset(get=get, sleep=no_sleep) == [{"playerId": 1}]
    assert get.calls[0]["timeout"] > 0
    assert get.calls[0]["params"] == {}


def test_max_gameweek_is_passed_as_a_query_param():
    get = scripted(GOOD)

    load_training_dataset(max_gameweek=6, get=get, sleep=no_sleep)

    assert get.calls[0]["params"] == {"maxGameweek": 6}


def test_retries_connection_errors_then_succeeds():
    get = scripted(requests.ConnectionError("down"), requests.Timeout("slow"), GOOD)

    assert load_training_dataset(get=get, sleep=no_sleep)
    assert len(get.calls) == 3


def test_retries_server_errors():
    get = scripted(FakeResponse(status_code=503), GOOD)

    assert load_training_dataset(get=get, sleep=no_sleep)
    assert len(get.calls) == 2


def test_gives_up_with_a_clear_error_after_repeated_failures():
    get = scripted(requests.ConnectionError("down"))

    with pytest.raises(DatasetLoadError, match="after 3 attempts"):
        load_training_dataset(get=get, sleep=no_sleep)

    assert len(get.calls) == 3


def test_client_errors_are_not_retried():
    get = scripted(FakeResponse(status_code=400, text="maxGameweek must be..."))

    with pytest.raises(DatasetLoadError, match="rejected"):
        load_training_dataset(get=get, sleep=no_sleep)

    assert len(get.calls) == 1


def test_empty_dataset_is_an_error():
    get = scripted(FakeResponse(payload={"rows": 0, "dataset": []}))

    with pytest.raises(DatasetLoadError, match="empty"):
        load_training_dataset(get=get, sleep=no_sleep)
