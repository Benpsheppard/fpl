# dataset_loader.py

# imports
import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:8000")

# The Node server builds the dataset on first request, which can take a while
REQUEST_TIMEOUT_SECONDS = float(os.getenv("NODE_API_TIMEOUT", "120"))
MAX_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 2


class DatasetLoadError(RuntimeError):
    pass


class PlayerNotFoundError(LookupError):
    pass


def _get_json(path, params, get, sleep):
    last_error = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = get(
                f"{NODE_API_URL}{path}",
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS
            )

            if response.status_code == 404:
                raise PlayerNotFoundError(response.text[:200])

            # Client errors will not fix themselves on retry
            if 400 <= response.status_code < 500:
                raise DatasetLoadError(
                    f"Node API rejected the request ({response.status_code}): {response.text[:200]}"
                )

            response.raise_for_status()

            return response.json()
        except (DatasetLoadError, PlayerNotFoundError):
            raise
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError, ValueError) as error:
            last_error = error

            if attempt < MAX_ATTEMPTS:
                sleep(RETRY_DELAY_SECONDS * attempt)

    raise DatasetLoadError(
        f"Could not reach {NODE_API_URL}{path} after {MAX_ATTEMPTS} attempts: {last_error}"
    )


def load_training_dataset(max_gameweek=None, get=requests.get, sleep=time.sleep):
    params = {}
    if max_gameweek is not None:
        params["maxGameweek"] = max_gameweek

    data = _get_json("/api/training/dataset", params, get, sleep)

    dataset = data.get("dataset") if isinstance(data, dict) else None

    if not isinstance(dataset, list) or len(dataset) == 0:
        raise DatasetLoadError(
            "Node API returned an empty training dataset. Has the data been synced?"
        )

    logger.info("Rows reported by Node: %s", data.get("rows"))
    logger.info("Rows received by Python: %s", len(dataset))

    return dataset


def load_prediction_features(player_id, get=requests.get, sleep=time.sleep):
    """Features for the player's next fixture, in the same shape as a training row."""
    data = _get_json("/api/prediction", {"playerId": player_id}, get, sleep)

    if not isinstance(data, dict) or "features" not in data:
        raise DatasetLoadError("Node API returned an unexpected prediction payload")

    return data
