# main.py

# Imports
from fastapi import FastAPI
import pandas as pd

# Services
from services.dataset_loader import load_training_dataset
from services.feature_processor import (
    prepare_training_dataframe, 
    add_features, 
    prepare_model_data
)
from services.predictor import (
    train_random_forest_model, 
    evaluate_model 
)
from services.diagnostics import ( inspect_model, inspect_feature_importance )

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
    print("\n=== RANDOM FOREST ===")
    random_forest_model = train_random_forest_model(X_train, y_train)
    random_forest_results = evaluate_model(random_forest_model, X_validation, y_validation)
    predictions = random_forest_model.predict(X_validation)
    # inspect_model(random_forest_model, dataframe, X_train, y_train, X_validation, y_validation, feature_columns, random_forest_results, predictions)
    inspect_feature_importance(random_forest_model, X_validation, y_validation, feature_columns)
    
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