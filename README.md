# FPL points predictor

Predicts a Fantasy Premier League player's points for their next fixture.

| Part | Folder | What it does | Default address |
|---|---|---|---|
| Data service | [server/](server/) | Express + MongoDB. Syncs FPL data and builds model features. | `127.0.0.1:8000` |
| Model service | [python/](python/) | FastAPI. Trains and serves the two-stage model. | `127.0.0.1:8001` |
| Client | [client/](client/) | React + Vite scaffold, not wired up yet. | `localhost:5173` |

```
FPL API ──sync──▶ Node/MongoDB ──training dataset──▶ Python ──train──▶ models/two_stage.joblib
                       ▲                                 │
                       └──── prediction features ◀───────┘  GET /predict/{player_id}
```

The model has two stages. Stage 1 predicts the chance the player appears at all. Stage 2 predicts points
from the usual features plus that probability.

## Setup

Requires Node 22+ and Python 3 (developed on 3.14), plus a MongoDB database.

```bash
# Node (server and root)
npm install
npm install --prefix server
npm install --prefix client             # only if you want the client
cp server/.env.example server/.env      # then fill it in, see below

# Python
cd python
python3 -m venv venv
venv/bin/pip install -r requirements-dev.txt
```

### Configuration

`server/.env` (git-ignored, see [server/.env.example](server/.env.example)):

| Variable | Purpose |
|---|---|
| `PORT`, `HOST` | Listen address. Defaults to `127.0.0.1:8000`. |
| `API_KEY` | Required for every POST (sync) request, sent as an `x-api-key` header. With no key set, writes are refused. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. Defaults to the Vite dev server. |
| `FPL_API_URL` | `https://fantasy.premierleague.com/api` |
| `MONGO_URI`, `MONGO_URI_TEST` | `NODE_ENV=development` uses the test database, anything else uses the main one. |

Generate a key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

The Python service reads these from its environment (it does not load `server/.env`):

| Variable | Purpose |
|---|---|
| `API_KEY` | Required for `POST /model/train`. Use the same value as the server. |
| `NODE_API_URL` | Where the data service is. Default `http://localhost:8000`. |
| `NODE_API_TIMEOUT` | Seconds to wait for the dataset. Default `120`. |
| `MODEL_PATH` | Where the trained model is saved. Default `python/models/two_stage.joblib`. |

## Running

```bash
npm run server                         # Node on :8000 (restarts on file changes)
API_KEY=<your key> npm run python      # Python on :8001
npm run client                         # optional
```

### First run, in order

Use the same `x-api-key` header on every POST. Postman or curl both work.

1. `POST :8000/api/fpl/sync-bootstrap` loads teams and players.
2. `POST :8000/api/fpl/sync-fixtures` loads the fixtures.
3. `POST :8000/api/fpl/sync-all-players` loads every player's gameweek history and past seasons.
   It makes one FPL request per player, so it takes a while. Only one bulk sync can run at a time (409 otherwise).
4. `POST :8001/model/train` builds the dataset, trains the model and saves it.
5. `GET :8001/predict/{fplId}` returns the prediction.

After each gameweek, repeat steps 2, 3 and 4. The model does not retrain on its own, so predictions stay on the last trained model until you do.

## API

### Python (`:8001`)

| Route | Description |
|---|---|
| `POST /model/train` | Train and save the two-stage model. Needs the API key. |
| `GET /model` | Summary of the current model: rows, latest gameweek trained on. |
| `GET /predict/{player_id}` | `appearance_probability`, `predicted_points`, name and gameweek for the player's next fixture. |
| `GET /dataset/test*` | Validation experiments (single split, rolling, two-stage). Slow; they log metrics. |

`/predict` returns 503 with no trained model, 404 for an unknown player, 502 if the data service is down, and 409 if the
features changed since training (retrain).

### Node (`:8000`)

| Route | Description |
|---|---|
| `GET /api/training/dataset?maxGameweek=N` | Training rows. Cached until the next sync. |
| `GET /api/training/:playerId/:gameweek` | One training row. |
| `GET /api/prediction?playerId=N` | Features for the player's next fixture. |
| `GET /api/players`, `/api/players/:playerId[/gameweeks\|seasons\|fixtures\|analysis]` | Stored player data. |
| `GET /api/fpl/...` | Proxies for the FPL API (bootstrap, fixtures, managers, player history). |
| `POST /api/fpl/sync-*` | Sync into MongoDB. Need the API key. `sync-all-players` is the one to use. |

Reads are limited to 300 requests a minute and writes to 10. Ids must be plain integers; `gameweek` is 1 to 38.

## Keeping the model honest

The main risk is leakage: a feature that uses information from the gameweek being predicted.

- Training and prediction both build features with `buildFeatureSet` in [server/services/featureBuilder.js](server/services/featureBuilder.js),
  passing only gameweeks before the target one. Don't compute features anywhere else.
- A player's team and opponent come from that gameweek's own record, not their current team.
- Double gameweeks are summed into one row per player per gameweek.
- Stage 2 trains on out-of-fold appearance probabilities, each scored by a classifier that only saw earlier gameweeks.
- The regressor uses every column except a list of exclusions (`REGRESSOR_EXCLUDED_FEATURES` in
  [feature_processor.py](python/services/feature_processor.py)), so **a new column is included automatically**.
  Check it for leakage before trusting a score. Ids and `target_*` columns are always excluded.
- Opponent strength is deliberately not a feature: only the current value is stored, which would leak later updates.

## Tests

```bash
cd server && npm test                              # Node, no database needed
cd python && venv/bin/python -m pytest             # Python
```

The Node prediction payload is checked against
[python/tests/fixtures/prediction_payload.json](python/tests/fixtures/prediction_payload.json), which the Python tests flatten.
If you change the feature schema on purpose, regenerate it with `UPDATE_CONTRACT_FIXTURE=1 npm test` in `server/`.
