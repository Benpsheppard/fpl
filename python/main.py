# main.py

# Imports
import logging
import hmac
import os
import threading

from fastapi import Depends, FastAPI, Header, HTTPException
import pandas as pd

# Services
from services.dataset_loader import (
    load_training_dataset,
    load_prediction_features,
    DatasetLoadError,
    PlayerNotFoundError
)
from services.two_stage_model import (
    train_two_stage_model,
    predict_two_stage,
    prepare_prediction_dataframe,
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

@app.get("/predict/{player_id}")
def predict(player_id: int):
    bundle = get_model()

    try:
        payload = load_prediction_features(player_id)
    except PlayerNotFoundError:
        raise HTTPException(status_code=404, detail="No upcoming fixture or history for this player")
    except DatasetLoadError as error:
        raise HTTPException(status_code=502, detail=str(error))

    try:
        result = predict_two_stage(bundle, prepare_prediction_dataframe([payload])).iloc[0]
    except ValueError as error:
        # Feature columns changed since the model was trained
        raise HTTPException(status_code=409, detail=f"{error}. Retrain the model.")

    name = (payload.get("context") or {}).get("player") or {}

    return {
        "playerId": int(result["playerId"]),
        "name": name.get("webName"),
        "fullName": " ".join(part for part in (name.get("firstName"), name.get("secondName")) if part) or None,
        "gameweek": int(result["gameweek"]),
        "appearance_probability": float(result["appearance_probability"]),
        "predicted_points": float(result["predicted_points"]),
        "model_trained_through_gameweek": bundle["metadata"]["trained_through_gameweek"],
    }
