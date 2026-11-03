"""Sync the latest FPL data and retrain the model in one step.

    npm run refresh                  (from the repo root)
    venv/bin/python refresh.py       (from python/)

Needs the Node and Python services running and the shared API key, read from the
API_KEY environment variable or server/.env. Run it after each gameweek.
"""

import argparse
import os
import sys

import requests

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_NODE_URL = os.getenv("NODE_API_URL", "http://localhost:8000")
DEFAULT_PYTHON_URL = os.getenv("PYTHON_API_URL", "http://127.0.0.1:8001")

# Each player is one FPL request, so a full sync takes a while
SYNC_TIMEOUT_SECONDS = 3600
TRAIN_TIMEOUT_SECONDS = 900

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_PARTIAL_SYNC = 2


class RefreshError(RuntimeError):
    pass


def read_api_key(environ=None, env_file=None):
    """API_KEY from the environment, else from server/.env (the Python service doesn't load it itself)."""
    environ = os.environ if environ is None else environ
    if environ.get("API_KEY"):
        return environ["API_KEY"]

    env_file = env_file or os.path.join(REPO_ROOT, "server", ".env")
    try:
        with open(env_file) as handle:
            for line in handle:
                key, separator, value = line.partition("=")
                if separator and key.strip() == "API_KEY":
                    return value.strip().strip("\"'")
    except OSError:
        pass

    raise RefreshError("No API key. Set API_KEY, or add it to server/.env.")


def post_json(post, url, api_key, timeout):
    try:
        response = post(url, headers={"x-api-key": api_key}, timeout=timeout)
    except requests.RequestException as error:
        raise RefreshError(f"Could not reach {url}: {error}")

    if response.status_code == 409:
        raise RefreshError(f"{url}: another sync or training run is already in progress. Try again when it finishes.")
    if response.status_code in (401, 503):
        raise RefreshError(f"{url}: the API key was rejected or is not configured on that service.")
    if response.status_code >= 400:
        raise RefreshError(f"{url} returned {response.status_code}: {response.text[:200]}")

    return response.json()


def refresh(api_key, node_url=DEFAULT_NODE_URL, python_url=DEFAULT_PYTHON_URL, post=None,
            log=print, skip_sync=False):
    """Sync, then train. Stops at the first step that fails so a model is never trained on a half-finished sync."""
    # Looked up here, not as a default argument, so it is the current requests.post (and patchable)
    post = post or requests.post
    summary = {"sync": None, "model": None}

    if not skip_sync:
        for step in ("sync-bootstrap", "sync-fixtures"):
            log(f"{step} ...")
            post_json(post, f"{node_url}/api/fpl/{step}", api_key, SYNC_TIMEOUT_SECONDS)

        log("sync-all-players (one FPL request per player, this takes a while) ...")
        players = post_json(post, f"{node_url}/api/fpl/sync-all-players", api_key, SYNC_TIMEOUT_SECONDS)
        summary["sync"] = {
            "players": players.get("totalPlayers"),
            "successful": players.get("successful"),
            "failed": players.get("failed"),
            "errors": players.get("errors", [])[:10],
        }
        log(f"  {players.get('successful')}/{players.get('totalPlayers')} players synced, {players.get('failed')} failed")

    log("training the model ...")
    summary["model"] = post_json(post, f"{python_url}/model/train", api_key, TRAIN_TIMEOUT_SECONDS)
    log(f"  trained through gameweek {summary['model'].get('trained_through_gameweek')} on {summary['model'].get('rows')} rows")

    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Sync FPL data and retrain the model.")
    parser.add_argument("--skip-sync", action="store_true", help="only retrain on the data already stored")
    parser.add_argument("--node-url", default=DEFAULT_NODE_URL)
    parser.add_argument("--python-url", default=DEFAULT_PYTHON_URL)
    args = parser.parse_args(argv)

    try:
        summary = refresh(read_api_key(), args.node_url, args.python_url, skip_sync=args.skip_sync)
    except RefreshError as error:
        print(f"Refresh failed: {error}", file=sys.stderr)
        return EXIT_ERROR

    failed = (summary["sync"] or {}).get("failed") or 0
    if failed:
        print(f"Done, but {failed} players failed to sync. First errors: {summary['sync']['errors']}", file=sys.stderr)
        return EXIT_PARTIAL_SYNC

    print("Done.")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
