# predictor.py

# Imports
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import (
    mean_absolute_error, root_mean_squared_error, 
    r2_score, roc_auc_score, accuracy_score, 
    precision_score, recall_score, brier_score_loss
)
from xgboost import XGBRegressor

### Regression Models ###

def train_random_forest_model(X_train, y_train):
    model = RandomForestRegressor(
        n_estimators = 100,
        max_features = "sqrt",
        min_samples_leaf = 4,
        random_state = 42,
        n_jobs = -1
    )

    model.fit(X_train, y_train)

    return model

def train_xgboost_model(X_train, y_train):
    model = XGBRegressor(
        n_estimators = 500,
        learning_rate = 0.05,
        max_depth = 6,
        min_child_weight = 2,
        subsample = 0.8,
        colsample_bytree = 0.8,
        objective="reg:squarederror",
        random_state = 42,
        n_jobs = -1
    )

    model.fit(X_train, y_train)

    return model

def evaluate_model(model, X_validation, y_validation):
    predictions = model.predict(X_validation)

    mae = mean_absolute_error(y_validation, predictions)
    rmse = root_mean_squared_error(y_validation, predictions)
    r2 = r2_score(y_validation, predictions)

    print("\n=== MODEL RESULTS ===")
    print(f"MAE: {mae:.4f}")
    print(f"RMSE: {rmse:.4f}")
    print(f"R2: {r2:.4f}")

    return {
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "predictions": predictions
    }

def evaluate_predictions(y_actual, predictions):
    return {
        "mae": mean_absolute_error(y_actual,predictions),
        "rmse": root_mean_squared_error(y_actual, predictions),
        "r2": r2_score(y_actual, predictions)
    }

### Classification Models ###

def train_random_forest_classifier(X_train, y_train):
    model = RandomForestClassifier(
        n_estimators = 500,
        max_features = "sqrt",
        min_samples_leaf = 4,
        random_state = 42,
        n_jobs = -1
    )

    model.fit(X_train, y_train)

    return model

def evaluate_appearance_classifier(model, X_validation, y_validation):
    probabilities = model.predict_proba(X_validation)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    results = {
        "accuracy": accuracy_score(y_validation, predictions),
        "precision": precision_score(
            y_validation, predictions, zero_division=0
        ),
        "recall": recall_score(
            y_validation, predictions, zero_division=0
        ),
        "brier": brier_score_loss(y_validation, probabilities),
        "actual_appearance_rate": float(np.mean(y_validation)),
        "predicted_appearance_rate": float(np.mean(probabilities)),
    }

    if len(np.unique(y_validation)) == 2:
        results["roc_auc"] = roc_auc_score(
            y_validation, probabilities
        )
    else:
        results["roc_auc"] = None

    print("\n=== APPEARANCE CLASSIFIER RESULTS ===")

    for metric, value in results.items():
        if value is not None:
            print(f"{metric}: {value:.4f}")

    return results

def generate_oof_appearance_probabilities(train_df, feature_columns):
    probabilities = pd.Series(np.nan, index=train_df.index, dtype=float)

    gameweeks = sorted(train_df["gameweek"].dropna().unique())

    for gameweek in gameweeks:
        earlier_rows = train_df[train_df["gameweek"] < gameweek]
        current_rows = train_df[train_df["gameweek"] == gameweek]

        if earlier_rows.empty or current_rows.empty:
            continue

        y_earlier = (
            earlier_rows["target_totalMinutes"] > 0
        ).astype(int)

        # A classifier needs examples from both classes.
        if y_earlier.nunique() < 2:
            continue

        classifier = train_random_forest_classifier(
            earlier_rows[feature_columns],
            y_earlier
        )

        probabilities.loc[current_rows.index] = (
            classifier.predict_proba(
                current_rows[feature_columns]
            )[:, 1]
        )

    return probabilities
