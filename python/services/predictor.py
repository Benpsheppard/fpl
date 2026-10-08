# predictor.py

# Imports
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor, ExtraTreesRegressor, RandomForestClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score, roc_auc_score, classification_report
from xgboost import XGBRegressor
from catboost import CatBoostRegressor

### Regression Models ###

def train_baseline_model(X_train, y_train):
    model = HistGradientBoostingRegressor(
        loss="absolute_error",
        max_iter=500,
        learning_rate=0.05,
        max_leaf_nodes = 31,
        min_samples_leaf = 20,
        l2_regularization = 1.0,
        random_state = 42
    )

    model.fit(X_train, y_train)

    return model

def train_random_forest_model_log(X_train, y_train):
    model = RandomForestRegressor(
        n_estimators = 500,
        max_features = "sqrt",
        min_samples_leaf = 2,
        random_state = 42,
        n_jobs = -1
    )

    # log1p requires target >= 0
    valid_mask = y_train >= 0

    X_train_clean = X_train.loc[valid_mask]
    y_train_clean = y_train.loc[valid_mask]

    print(f"Remoed {(~valid_mask).sum()} negative target rows")
    print(f"Training rows: {len(y_train_clean)}")

    # Transform target before training
    y_train_log = np.log1p(y_train_clean)

    model.fit(X_train_clean, y_train_log)

    return model

def train_random_forest_model(X_train, y_train):
    model = RandomForestRegressor(
        n_estimators = 500,
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

def train_extra_trees_model(X_train, y_train):
    model = ExtraTreesRegressor(
        n_estimators = 500,
        max_features = "sqrt",
        min_samples_leaf = 2,
        random_state = 42,
        n_jobs = -1
    )

    model.fit(X_train, y_train)

    return model

def train_catboost_model(X_train, y_train):
    model = CatBoostRegressor(
        iterations = 500,
        depth = 6,
        learning_rate = 0.05,
        loss_function = "RMSE",
        random_seed = 42,
        verbose = False
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

def train_classifier(X_train, y_train):
    model = RandomForestClassifier(
        n_estimators = 500,
        max_features = "sqrt",
        min_samples_leaf = 2,
        random_state = 42,
        n_jobs = -1
    )

    model.fit(X_train, y_train)

    return model

def create_oof_haul_probabilities(X_train, y_train):
    probabilities = np.zeros(len(X_train))

    cv = StratifiedKFold(
        n_splits = 5,
        shuffle = True,
        random_state = 42
    )

    for train_indices, validation_indices in cv.split(X_train, y_train):
        X_fold_train = X_train.iloc[train_indices]
        y_fold_train = y_train.iloc[train_indices]

        X_fold_validation = X_train.iloc[validation_indices]

        model = RandomForestClassifier(
            n_estimators = 500,
            max_features = "sqrt",
            min_samples_leaf = 2,
            random_state = 42,
            n_jobs = -1
        )

        model.fit(X_fold_train, y_fold_train)

        probabilities[validation_indices] = (model.predict_proba(X_fold_validation)[:, 1])

        return probabilities

def evaluate_classifier_model(model, X_validation, y_validation):
    probabilities = model.predict_proba(X_validation)[:, 1]

    predictions = (probabilities >= 0.5).astype(int)

    roc_auc = roc_auc_score(y_validation, probabilities)
    report = classification_report(y_validation, predictions, output_dict = True)

    print("\n=== CLASSIFICATION MODEL RESULTS ===")
    print("ROC AUC: ", roc_auc)
    print("Report: ", report)

    return {
        "roc_auc": roc_auc,
        "probabilities": probabilities,
        "predictions": predictions,
        "report": report
    }