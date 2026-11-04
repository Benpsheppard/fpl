# main.py

# Imports
import logging
import hmac
import os
import threading

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

# Services
from services.dataset_loader import (
    load_training_dataset,
    load_prediction_features,
    load_all_prediction_features,
    DatasetLoadError,
    PlayerNotFoundError
)
from services.decision_backtest import backtest_decisions
from services.horizon_backtest import backtest_horizons
from services.model_comparison import compare_models, json_safe
from services.two_stage_model import (
    predict_payloads,
    staleness_warnings,
    train_two_stage_model,
    save_model,
    load_model,
    ModelNotTrainedError
)
from services.feature_processor import (
    prepare_training_dataframe, 
    add_features, 
    prepare_model_data,
    prepare_classifier_model_data,
    run_rolling_validation,
    run_rolling_two_stage_validation
)
from services.predictor import (
    train_random_forest_model, 
    train_random_forest_classifier,
    evaluate_model,
    evaluate_appearance_classifier
)
from services.diagnostics import (
    inspect_model, 
    inspect_feature_importance,
    inspect_row
)

logger = logging.getLogger(__name__)

# Show INFO logs (model diagnostics, dataset sizes) in the console
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

# App initialisation
app = FastAPI(
    title="FPL Prediciton API",
    description="Machine learning service for FPL Predictions",
    version="1.0.0"
)

# The browser app calls /predict directly. Only GET is allowed cross-origin, so a web page
# can read predictions but can never reach /model/train.
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",") if origin.strip()],
    allow_methods=["GET"],
    allow_headers=[],
)

# Routes
@app.get("/")
def root():
    return {
        "message": "FPL Prediction API is running"
    }

## CURRENT BEST - RF STANDARD
@app.get("/dataset/test")
def test_dataset():
    # Load Dataset
    dataset = load_training_dataset()

    # Prep dataframe
    dataframe = prepare_training_dataframe(dataset)
    dataframe = add_features(dataframe)

    # Split data and prepare for model
    (X_train, y_train, X_validation, y_validation, feature_columns) = prepare_model_data(dataframe)

    # Random Forest Model
    logger.info("\n=== RANDOM FOREST ===")
    random_forest_model = train_random_forest_model(X_train, y_train)
    random_forest_results = evaluate_model(random_forest_model, X_validation, y_validation)
    predictions = random_forest_model.predict(X_validation)
    inspect_model(random_forest_model, dataframe, X_train, y_train, X_validation, y_validation, feature_columns, random_forest_results, predictions)

    # Return data
    return {
        "rows": len(dataframe),
        "features": len(feature_columns),

        "random_forest": {
            "mae": random_forest_results["mae"],
            "rmse": random_forest_results["rmse"],
            "r2": random_forest_results["r2"],
        }
    }

@app.get("/dataset/test/rolling")
def test_rolling():
    dataset = load_training_dataset()

    dataframe = prepare_training_dataframe(dataset)
    dataframe = add_features(dataframe)

    results = run_rolling_validation(
        dataframe,
        start_gameweek = 3
    )

    return {
        "gameweeks": len(results),
        "average_mae": results["mae"].mean(),
        "average_rmse": results["rmse"].mean(),
        "average_r2": results["r2"].mean()
    }

@app.get("/dataset/test/two-stage")
def test_two_stage():
    # Load Dataset
    dataset = load_training_dataset()

    # Prep dataframe
    dataframe = prepare_training_dataframe(dataset)
    dataframe = add_features(dataframe)

    # First stage classifier
    (X_classifier_train, y_classifier_train, X_classifier_validation, y_classifier_validation, feature_columns, oof_probabilities) = prepare_classifier_model_data(dataframe)

    logger.info("\n=== FIRST STAGE: CLASSIFIER ===")
    rf_classifier_model = train_random_forest_classifier(X_classifier_train, y_classifier_train)
    rf_classifier_results = evaluate_appearance_classifier(rf_classifier_model, X_classifier_validation, y_classifier_validation)
    
    # Second stage regressor
    (X_train, y_train, X_validation, y_validation, feature_columns) = prepare_model_data(dataframe)
    
    X_train["predicted_appearance_probability"] = ( oof_probabilities.reindex(X_train.index) )

    validation_probabilities = pd.Series(
        rf_classifier_model.predict_proba( X_classifier_validation )[:, 1],
        index=X_classifier_validation.index
    )

    X_validation["predicted_appearance_probability"] = ( validation_probabilities.reindex(X_validation.index) )

    usable_indices = X_train[ "predicted_appearance_probability" ].dropna().index

    X_train = X_train.loc[usable_indices]
    y_train = y_train.loc[usable_indices]

    X_validation = X_validation.dropna( subset=["predicted_appearance_probability"] )
    y_validation = y_validation.loc[ X_validation.index ]

    logger.info("\n=== SECOND STAGE: RANDOM FOREST ===")
    random_forest_model = train_random_forest_model(X_train, y_train)
    random_forest_results = evaluate_model(random_forest_model, X_validation, y_validation)
    predictions = random_forest_model.predict(X_validation)
    stage2_feature_columns = list(X_train.columns)
    inspect_model(random_forest_model, dataframe, X_train, y_train, X_validation, y_validation, stage2_feature_columns, random_forest_results, predictions)
    # inspect_feature_importance(random_forest_model, X_validation, y_validation, stage2_feature_columns)
    # inspect_row(dataframe, 1)

    # Return data
    return {
        "rows": len(dataframe),
        "two_stage_features": len(X_train.columns),
        "two_stage_training_rows": len(X_train),
        "validation_rows": len(X_validation),

        "classifier": rf_classifier_results,

        "two_stage": {
            "mae": random_forest_results["mae"],
            "rmse": random_forest_results["rmse"],
            "r2": random_forest_results["r2"],
        }
    }

@app.get("/dataset/test/rolling-two-stage")
def test_rolling_two_stage():
    dataset = load_training_dataset()

    dataframe = prepare_training_dataframe(dataset)
    dataframe = add_features(dataframe)

    results = run_rolling_two_stage_validation(
        dataframe,
        start_gameweek=2
    )

    if results.empty:
        return {
            "gameweeks": 0,
            "message": "No valid rolling validation folds"
        }

    return {
        "gameweeks": len(results),
        "average_mae": results["mae"].mean(),
        "average_rmse": results["rmse"].mean(),
        "average_r2": results["r2"].mean(),
        "results": results.to_dict(orient="records")
    }


### Production two-stage model ###

# The trained model is kept in memory and on disk, so restarts keep predicting
model_bundle = None
training_lock = threading.Lock()

def get_model():
    global model_bundle

    if model_bundle is None:
        try:
            model_bundle = load_model()
        except ModelNotTrainedError as error:
            raise HTTPException(status_code=503, detail=str(error))

    return model_bundle

def require_api_key(x_api_key: str | None = Header(default=None)):
    """Training is expensive and replaces the saved model, so it needs the API_KEY."""
    expected = os.getenv("API_KEY")

    if not expected:
        raise HTTPException(status_code=503, detail="API_KEY is not configured on the server")

    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

@app.post("/model/train", dependencies=[Depends(require_api_key)])
def train_model():
    global model_bundle

    if not training_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Training already in progress")

    try:
        try:
            dataset = load_training_dataset()
        except DatasetLoadError as error:
            raise HTTPException(status_code=502, detail=str(error))

        dataframe = add_features(prepare_training_dataframe(dataset))

        try:
            bundle = train_two_stage_model(dataframe)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error))

        save_model(bundle)
        model_bundle = bundle

        return bundle["metadata"]
    finally:
        training_lock.release()

@app.get("/model")
def model_info():
    return get_model()["metadata"]

def prediction_errors(action):
    """Run a prediction step, turning a model/data mismatch into a 409 that says what to do."""
    try:
        return action()
    except (ValueError, KeyError) as error:
        # Feature columns changed since the model was trained, or Node and Python disagree on the schema
        raise HTTPException(status_code=409, detail=f"{error}. Retrain the model, and restart Node if it was updated.")

@app.get("/predict/{player_id}")
def predict(player_id: int):
    bundle = get_model()

    try:
        payload = load_prediction_features(player_id)
    except PlayerNotFoundError:
        raise HTTPException(status_code=404, detail="No upcoming fixture or history for this player")
    except DatasetLoadError as error:
        raise HTTPException(status_code=502, detail=str(error))

    prediction = prediction_errors(lambda: predict_payloads(bundle, [payload])[0])
    freshness = (payload.get("context") or {}).get("freshness") or {}

    return {
        **prediction,
        "model_trained_through_gameweek": bundle["metadata"]["trained_through_gameweek"],
        "data_through_gameweek": freshness.get("dataThroughGameweek"),
        "warnings": staleness_warnings(bundle["metadata"], freshness),
    }

@app.get("/predict")
def predict_all(
    position: int | None = Query(default=None, ge=1, le=4, description="1 GK, 2 DEF, 3 MID, 4 FWD"),
    team: int | None = Query(default=None, ge=1),
    max_price: float | None = Query(default=None, gt=0, description="In millions, e.g. 7.5"),
    limit: int = Query(default=50, ge=1, le=1000),
    horizon: int = Query(default=1, ge=1, le=5, description="Gameweeks to look ahead. Above 1, each player also gets an `outlook`."),
):
    """Every active player's next-fixture prediction, best expected points first.

    With a horizon, players are ranked by their expected points over the whole window. Beyond the next
    gameweek the model is little better than recent form, so those totals are less certain."""
    bundle = get_model()

    try:
        data = load_all_prediction_features(horizon) if horizon > 1 else load_all_prediction_features()
    except DatasetLoadError as error:
        raise HTTPException(status_code=502, detail=str(error))

    def wanted(payload):
        player = (payload.get("context") or {}).get("player") or {}
        price = player.get("price")

        return (
            (position is None or player.get("elementType") == position)
            and (team is None or player.get("team") == team)
            # A player with no known price can't be said to fit a budget
            and (max_price is None or (price is not None and price <= max_price))
        )

    payloads = [payload for payload in data["players"] if wanted(payload)]
    predictions = prediction_errors(lambda: predict_payloads(bundle, payloads))

    def ranking(prediction):
        total = (prediction.get("outlook") or {}).get("total_expected_points", prediction["expected_points"])
        return (total, prediction["expected_points"], prediction["predicted_points"])

    predictions.sort(key=ranking, reverse=True)

    freshness = data.get("freshness") or {}

    return {
        "horizon": horizon,
        "count": len(predictions),
        "returned": min(limit, len(predictions)),
        "model_trained_through_gameweek": bundle["metadata"]["trained_through_gameweek"],
        "data_through_gameweek": freshness.get("dataThroughGameweek"),
        "warnings": staleness_warnings(bundle["metadata"], freshness),
        "players": predictions[:limit],
    }


@app.get("/dataset/test/compare")
def compare_single_and_two_stage(start_gameweek: int = 3, end_gameweek: int | None = None):
    """Single-stage vs two-stage on identical validation players, with a paired significance check."""
    try:
        dataset = load_training_dataset()
    except DatasetLoadError as error:
        raise HTTPException(status_code=502, detail=str(error))

    dataframe = add_features(prepare_training_dataframe(dataset))

    per_gameweek, summary = compare_models(dataframe, start_gameweek, end_gameweek)

    if per_gameweek.empty:
        raise HTTPException(status_code=422, detail="No gameweeks had enough data to compare")

    return json_safe({**summary, "per_gameweek": per_gameweek.round(4).to_dict(orient="records")})


@app.get("/dataset/test/backtest")
def backtest_player_comparisons(
    start_gameweek: int = 3,
    end_gameweek: int | None = None,
    target_accuracy: float = Query(default=0.6, gt=0.5, lt=1, description="How often the higher-rated player must really score more"),
):
    """Do the model's differences between players hold up? Compares every same-position pair, gameweek by gameweek."""
    try:
        dataset = load_training_dataset()
    except DatasetLoadError as error:
        raise HTTPException(status_code=502, detail=str(error))

    dataframe = add_features(prepare_training_dataframe(dataset))

    result = backtest_decisions(dataframe, start_gameweek, end_gameweek, target_accuracy)

    if result["gameweeks"] == 0:
        raise HTTPException(status_code=422, detail="No gameweeks had enough data to backtest")

    return json_safe(result)


@app.get("/dataset/test/horizons")
def backtest_forecast_horizons(
    max_horizon: int = Query(default=3, ge=1, le=5, description="How many gameweeks ahead to test, from 1"),
    start_gameweek: int | None = None,
    end_gameweek: int | None = None,
):
    """How much worse is the forecast the further ahead it looks? Scored on the same gameweeks and players at each horizon."""
    frames = {}

    for horizon in range(1, max_horizon + 1):
        try:
            dataset = load_training_dataset(horizon=horizon)
        except DatasetLoadError as error:
            raise HTTPException(status_code=502, detail=str(error))

        frames[horizon] = add_features(prepare_training_dataframe(dataset))

    result = backtest_horizons(frames, start_gameweek, end_gameweek)

    if "by_horizon" not in result:
        raise HTTPException(status_code=422, detail="No gameweeks had enough data to test these horizons")

    return json_safe(result)
