# FPL points predictor

Predicts a Fantasy Premier League player's points for their next fixture.

| Part | Folder | What it does | Default address |
|---|---|---|---|
| Data service | [server/](server/) | Express + MongoDB. Syncs FPL data and builds model features. | `127.0.0.1:8000` |
| Model service | [python/](python/) | FastAPI. Trains and serves the two-stage model. | `127.0.0.1:8001` |
| Client | [client/](client/) | React + Vite squad picker and transfer suggestions. | `localhost:5173` |

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

### After each gameweek

```bash
npm run refresh
```

This runs steps 1 to 4 in order (syncing bootstrap, fixtures and all players, then training) against the running services,
reading the API key from `API_KEY` or `server/.env`. It stops at the first step that fails, so a model is never trained
on a half-finished sync. `--skip-sync` only retrains. Exit code 2 means the model trained but some players failed to sync.

The model does not retrain on its own. Until you refresh, predictions use the last trained model, and `/predict` says so
(see [Warnings](#warnings)).

## API

### Python (`:8001`)

| Route | Description |
|---|---|
| `POST /model/train` | Train and save the two-stage model. Needs the API key. |
| `GET /model` | Summary of the current model: rows, latest gameweek trained on. |
| `GET /predict/{player_id}` | Prediction for the player's next fixture. See [Reading a prediction](#reading-a-prediction). |
| `GET /predict` | Every active player, best `expected_points` first. Filters: `position` (1 GK, 2 DEF, 3 MID, 4 FWD), `team`, `max_price` (in millions), `limit` (default 50). |
| `GET /dataset/test/compare` | Single-stage vs two-stage on identical validation players, with a paired significance check. |
| `GET /dataset/test/backtest` | Do the model's differences between players hold up? How often the higher-rated player of each same-position pair really scored more, by size of the gap. Takes about 15 seconds. |
| `GET /dataset/test*` | Other validation experiments (single split, rolling, two-stage). Slow; they log metrics. |

`/predict` returns 503 with no trained model, 404 for an unknown player, 502 if the data service is down, and 409 if the
features changed since training (retrain).

### Node (`:8000`)

| Route | Description |
|---|---|
| `GET /api/training/dataset?maxGameweek=N` | Training rows. Cached until the next sync. |
| `GET /api/training/:playerId/:gameweek` | One training row. |
| `GET /api/prediction?playerId=N` | Features for the player's next fixture. |
| `GET /api/prediction/all` | The same for every active player, loading the data once. |
| `GET /api/players`, `/api/players/:playerId[/gameweeks\|seasons\|fixtures\|analysis]` | Stored player data. |
| `GET /api/fpl/...` | Proxies for the FPL API (bootstrap, fixtures, managers, player history). |
| `POST /api/fpl/sync-*` | Sync into MongoDB. Need the API key. `sync-all-players` is the one to use. |

Reads are limited to 300 requests a minute and writes to 10. Ids must be plain integers; `gameweek` is 1 to 38.

## The app

`npm run client` serves it at `localhost:5173`. It needs Node and Python running (see [Running](#running)) and a trained model.

- **Best transfers.** For each player you own, the best replacement you can afford: same position, no more than three from a
  club, within the player's *sell price* plus your bank. Ranked by expected points gained, minus 4 if you have no free
  transfer. Swaps that gain less than 0.5 points are left out, because that is within the model's typical error (about 1.2).
  Swaps for a player who is out of action come first. A bench player is worth only what the new player would add by taking a starting place, and each player to buy is listed once.
- **Your team.** Loaded from the FPL website for the manager in `MY_FPL_MANAGER_ID`, with exact sell prices worked out from your
  transfer history. Set *free transfers* by hand: FPL does not publish them.
- **Players you could buy.** Everyone you don't already own, with filters (position, club, max price, name, hide injured, hide
  doubtful) and sortable columns (price, expected points, chance of playing, points per £m).
- **Fixtures.** Each player shows their next five gameweeks, coloured by FPL's own 1-5 difficulty rating: deep green (1, easiest),
  green (2), grey (3, neutral), red (4) and deep red (5, hardest), with (H) home or (A) away. A blank gameweek is a gap (–),
  a double gameweek shows two fixtures in one cell, and a match already played this round is faded. Hover a fixture for the
  full club name and rating. The same window starts at the coming round for every player, so the columns line up.
- **Flags.** *Out* (injured, suspended, unavailable), *Doubtful* (FPL gives a chance below 100%) and *Rotation risk* (fit, but the
  model's first stage gives them under a 60% chance of playing). Hover a flag for FPL's note.
- **Out-of-date banner.** Appears only when the prediction service reports the data or model is behind (see [Warnings](#warnings)).

**Limits.** Predictions cover the next gameweek only, so a swap is judged on one game. FPL only publishes your squad as of the last
deadline, so transfers made since then show only if FPL lists them (the page says "plus N pending transfers"). Sell prices use the
standard rule (you keep half of any rise) and don't account for Free Hit oddities beyond reverting to the previous squad.

The app reads from `localhost:8000` and `127.0.0.1:8001` by default; see [client/.env.example](client/.env.example) to change that.

## Reading a prediction

`GET /predict/{player_id}` returns, among other fields:

| Field | Meaning |
|---|---|
| `model_points` | The model's raw output for the gameweek. |
| `predicted_points` | `model_points`, scaled by the number of fixtures in a double gameweek the model hasn't learned from (below). |
| `expected_points` | `predicted_points` weighted by the player's chance of playing. **Rank players by this.** |
| `appearance_probability` | Stage 1's chance the player plays at all. `adjusted_appearance_probability` weights it by availability. |
| `adjustments` | Exactly what was applied: the fixture count, whether it was scaled, and the availability status, chance, basis and source. |

### Warnings

Both `/predict` routes return a `warnings` list, so a prediction never silently rests on old information:

| Code | Meaning | Fix |
|---|---|---|
| `data_stale` | Fixtures show a gameweek with results, but the stored player data stops earlier. | Sync (`npm run refresh`). |
| `model_stale` | The model was trained on fewer gameweeks than the data now holds. | Retrain (`npm run refresh`). |

A stale fixture list cannot be detected this way, which is why `refresh` syncs fixtures first. The responses also carry
`data_through_gameweek` and `model_trained_through_gameweek`.

**Double gameweeks.** A player's points for a double gameweek are the sum of both fixtures, and the features include
`fixturesInGameweek` and the second fixture's side and difficulty. But the model can only learn the effect from double
gameweeks that have been played. Until it has seen at least 100 such rows (`double_gameweek_training_rows` in `GET /model`),
`/predict` multiplies the model's figure by the fixture count and sets `scaled_by_fixture_count`. Once the schedule has
double gameweeks and you have retrained after they are played, the model's own figure is used. The scaling ignores the
second fixture's difficulty, and a gameweek already under way is predicted as a whole.

**Injury news.** FPL publishes a chance of playing only for the coming round: the "next round" figure before a gameweek
starts, the "this round" figure once it is under way. For a later gameweek there is no news (`basis: "none"`), so nothing
is adjusted. With no percentage, an available player counts as 1 and an injured, suspended or unavailable player as 0. A
doubtful player with no percentage is left unadjusted rather than guessed. Weighting by the chance slightly double-counts
for players the model already expects to miss minutes, so treat `expected_points` as a ranking aid, not a forecast.

## Keeping the model honest

The main risk is leakage: a feature that uses information from the gameweek being predicted.

- Training and prediction both build features with `buildFeatureSet` in [server/services/featureBuilder.js](server/services/featureBuilder.js),
  passing only gameweeks before the target one. Don't compute features anywhere else.
- A player's team and opponent come from that gameweek's own record, not their current team.
- Double gameweeks are summed into one row per player per gameweek, with the fixture count as a feature.
- Stage 2 trains on out-of-fold appearance probabilities, each scored by a classifier that only saw earlier gameweeks.
- The regressor uses every column except a list of exclusions (`REGRESSOR_EXCLUDED_FEATURES` in
  [feature_processor.py](python/services/feature_processor.py)), so **a new column is included automatically**.
  Check it for leakage before trusting a score. Ids and `target_*` columns are always excluded.
- Opponent strength is deliberately not a feature: only the current value is stored, which would leak later updates.

## Tests

```bash
npm test                                           # all three suites, from the repo root
npm run test:server                                # Node only, no database needed
npm run test:python                                # Python only
npm run test:client                                # React app (Vitest)
```

[GitHub Actions](.github/workflows/ci.yml) runs all three suites (and lints and builds the client) on every push and pull request, in parallel, from a clean
checkout using the lockfile (`npm ci`) and the pinned `requirements-dev.txt`. Neither needs MongoDB, the FPL API or
any secrets. If CI fails but your machine passes, the usual cause is a dependency installed locally but missing from
those files.

The Node prediction payload is checked against
[python/tests/fixtures/prediction_payload.json](python/tests/fixtures/prediction_payload.json), which the Python tests flatten.
If you change the feature schema on purpose, regenerate it with `UPDATE_CONTRACT_FIXTURE=1 npm test` in `server/`.
