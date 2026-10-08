# diagnostics.py

# imports
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from services.predictor import evaluate_predictions

def inspect_feature_importance(model, X_validation, y_validation, feature_columns):
    importance = permutation_importance(model, X_validation, y_validation, scoring="neg_mean_absolute_error", n_repeats=10, random_state=42)
    
    importance_df = pd.DataFrame({
        "feature": feature_columns,
        "importance_mean": importance.importances_mean,
        "importance_std": importance.importances_std
    })

    importance_df = importance_df.sort_values( "importance_mean", ascending = False )

    print("\n=== TOP FEATURES ===")
    print(importance_df.head(50).to_string(index=False))

    return importance_df

def inspect_validation_features(dataframe, validation_gameweek=5):
    validation_df = dataframe[dataframe["gameweek"] == validation_gameweek].copy()

    print("\n=== VALIDATION FEATURE CHECK ===")

    columns = [
        "playerId",
        "gameweek",
        "player_totalPoints",
        "player_pointsPerGame",
        "player_minutes",
        "player_expectedGoals",
        "player_expectedAssists",
        "player_bps",
        "player_creativity",
        "player_threat",
        "recent_lastGameweek_minutes",
        "recent_last3Gameweeks_minutes",
    ]

    print(validation_df[columns] .head(20) .to_string(index=False))

def inspect_model_data(X_train, y_train, X_validation, y_validation, feature_columns):
    print("\n=== MODEL DATA ===")

    print(f"Training features: {X_train.shape}")
    print(f"Validation features: {X_validation.shape}")
    print(f"Number of features: {len(feature_columns)}")

    print("\n=== FEATURE TYPES ===")
    print(X_train.dtypes.value_counts())

    print("\n=== FEATURES ===")
    for column in feature_columns:
        print(column)

    print("\n=== TARGET ===")
    print(f"Training target shape: {y_train.shape}")
    print(f"Validation target shape: {y_validation.shape}")

def inspect_split(train_df, validation_df):
    print("\n=== TRAINING SET ===")
    print(f"Rows: {len(train_df)}")
    print(f"Gameweeks: {sorted(train_df['gameweek'].unique())}")
    print(train_df["target_totalPoints"].describe())

    print("\n=== VALIDATION SET ===")
    print(f"Rows: {len(validation_df)}")
    print(f"Gameweeks: {sorted(validation_df['gameweek'].unique())}")
    print(validation_df["target_totalPoints"].describe())

def inspect_training_dataframe(dataframe):
    print("\n=== DATASET SHAPE ===")
    print(f"Rows: {len(dataframe)}")
    print(f"Columns: {len(dataframe.columns)}")

    print("\n=== GAMEWEEK DISTRIBUTION ===")
    print(dataframe["gameweek"].value_counts().sort_index())

    print("\n=== TARGET ===")
    print(dataframe["target_totalPoints"].describe())

    print("\n=== MISSING VALUES ===")
    missing = dataframe.isna().sum()
    missing = missing[missing > 0].sort_values(ascending=False)

    if missing.empty:
        print("No missing values.")
    else:
        print(missing)

    print("\n=== UNIQUE VALUES ===")
    for column in [ "playerId", "gameweek", "fixtures_isHome", "fixtures_difficulty", "fixtures_opponentStrength", "player_elementType" ]:
        print(f"{column}: {dataframe[column].nunique()} unique values")

    print("\n=== SAMPLES ===")
    print(dataframe.head(3).to_string())

def mean_baseline(y_train, y_validation):
    prediction = y_train.mean()

    predictions = np.full(
        len(y_validation),
        prediction
    )

    return predictions

def zero_baseline(y_validation):
    return np.zeros(len(y_validation))

def inspect_baselines(y_train, y_validation):
    print("\n=== BASELINE COMPARISON ===")
    
    mean_predictions = mean_baseline(y_train, y_validation)
    mean_results = evaluate_predictions(y_validation, mean_predictions)

    print("\nMean baseline:")
    print(f"MAE:  {mean_results['mae']:.4f}")
    print(f"RMSE: {mean_results['rmse']:.4f}")
    print(f"R2:   {mean_results['r2']:.4f}")

    zero_predictions = zero_baseline(y_validation)
    zero_results = evaluate_predictions(y_validation, zero_predictions)

    print("\nZero baseline:")
    print(f"MAE:  {zero_results['mae']:.4f}")
    print(f"RMSE: {zero_results['rmse']:.4f}")
    print(f"R2:   {zero_results['r2']:.4f}")

    return {
        "mean": mean_results,
        "zero": zero_results
    }

def inspect_predictions_by_minutes(X_validation, y_validation, predictions):
    prediction_df = pd.DataFrame({
        "actual": y_validation.to_numpy(),
        "predicted": predictions,
        "lastGameweekMinutes": (
            X_validation["recent_lastGameweek_minutes"]
            .to_numpy()
        ),
    })

    prediction_df["absolute_error"] = (prediction_df["predicted"] - prediction_df["actual"]).abs()

    prediction_df["minutes_group"] = pd.cut(
        prediction_df["lastGameweekMinutes"],
        bins=[-1, 0, 30, 60, 89, 90],
        labels=[
            "0",
            "1-30",
            "31-60",
            "61-89",
            "90",
        ],
    )

    print("\n=== ERROR BY PREVIOUS GAMEWEEK MINUTES ===")

    print(
        prediction_df
        .groupby("minutes_group", observed=True)
        .agg(
            players=("actual", "count"),
            actual_mean=("actual", "mean"),
            predicted_mean=("predicted", "mean"),
            mae=("absolute_error", "mean"),
        )
    )

    return prediction_df

def inspect_predictions_by_position(X_validation, y_validation, predictions):
    prediction_df = pd.DataFrame({
        "actual": y_validation.to_numpy(),
        "predicted": predictions,
        "elementType": (
            X_validation["player_elementType"]
            .to_numpy()
        ),
    })

    prediction_df["absolute_error"] = (
        prediction_df["predicted"]
        - prediction_df["actual"]
    ).abs()

    print("\n=== ERROR BY PLAYER POSITION ===")

    print(
        prediction_df
        .groupby("elementType")
        .agg(
            players=("actual", "count"),
            actual_mean=("actual", "mean"),
            predicted_mean=("predicted", "mean"),
            mae=("absolute_error", "mean"),
        )
    )

    return prediction_df

def inspect_high_scoring_players(X_validation, y_validation, predictions):
    inspection_df = X_validation.copy()

    inspection_df["actual"] = y_validation.to_numpy()
    inspection_df["predicted"] = predictions

    inspection_df["absolute_error"] = (inspection_df["predicted"] - inspection_df["actual"]).abs()

    columns = [
        "actual",
        "predicted",
        "absolute_error",
        "recent_lastGameweek_minutes",
        "recent_last3Gameweeks_minutes",
        "recent_last5Gameweeks_minutes",
        "recent_lastGameweek_xG",
        "recent_lastGameweek_xA",
        "recent_last3Gameweeks_xG",
        "recent_last3Gameweeks_xA",
        "historical_xG",
        "historical_xA",
        "player_pointsPerGame",
        "player_expectedGoals",
        "player_expectedAssists",
    ]

    print("\n=== HIGH SCORING PLAYERS ===")

    print(
        inspection_df
        .sort_values("actual", ascending=False)
        [columns]
        .head(20)
        .to_string(index=False)
    )

    return inspection_df

def inspect_predictions(y_actual, predictions):
    prediction_df = pd.DataFrame({
        "actual": y_actual.to_numpy(),
        "predicted": predictions,
    })

    prediction_df["error"] = (
        prediction_df["predicted"] - prediction_df["actual"]
    )

    prediction_df["absolute_error"] = (
        prediction_df["error"].abs()
    )

    print("\n=== PREDICTION DISTRIBUTION ===")
    print(prediction_df["predicted"].describe())

    print("\n=== ACTUAL vs PREDICTED ===")
    print(
        prediction_df[["actual", "predicted"]]
        .describe()
    )

    print("\n=== NEGATIVE PREDICTIONS ===")
    negative_predictions = (
        prediction_df["predicted"] < 0
    ).sum()

    print(
        f"{negative_predictions} / {len(prediction_df)} "
        f"({negative_predictions / len(prediction_df):.1%})"
    )

    print("\n=== MEAN ERROR ===")
    print(f"{prediction_df['error'].mean():.4f}")

    print("\n=== MAE BY ACTUAL SCORE ===")
    print(
        prediction_df
        .groupby("actual")["absolute_error"]
        .agg(["count", "mean"])
        .head(15)
    )

    print("\n=== LARGEST ERRORS ===")
    print(
        prediction_df
        .sort_values("absolute_error", ascending=False)
        .head(20)
        .to_string(index=False)
    )

    return prediction_df

def inspect_sample_predictions(y_actual, predictions, count=20):
    print("\n=== SAMPLE PREDICTIONS ===")

    for actual, prediction in zip(y_actual.iloc[:count], predictions[:count]):
        print(
            f"Actual: {actual:>5.1f} | "
            f"Predicted: {prediction:>6.2f}"
        )

def inspect_haul_probabilities(X_validation, y_validation, probabilities):
    inspection_df = X_validation.copy()

    inspection_df["actual"] = y_validation.to_numpy()
    inspection_df["haul_probability"] = probabilities

    print("\n=== HAUL PROBABILITY BY ACTUAL SCORE ===")
    print(inspection_df
            .groupby("actual")["haul_probability"]
            .agg(["count", "mean", "median", "max"])
            .sort_index()
        )
    
    print("\n=== HIGHEST HAUL PROBABILITIES ===")
    print(inspection_df[["actual", "haul_probability"]].sort_values("haul_probability", ascending=False).head(30).to_string(index=False))

    return inspection_df

def inspect_regression_error_by_haul_probability(y_actual, predictions, haul_probabilities):
    inspection_df = pd.DataFrame({
        "actual": y_actual.to_numpy(),
        "predicted": predictions,
        "haul_probability": haul_probabilities,
    })

    inspection_df["absolute_error"] = (inspection_df["predicted"] - inspection_df["actual"]).abs()

    inspection_df["haul_probability_group"] = pd.cut(
        inspection_df["haul_probability"],
        bins=[0, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0],
        labels=[
            "<0.1",
            "0.1-0.2",
            "0.2-0.3",
            "0.3-0.4",
            "0.4-0.5",
            "0.5+",
        ],
        include_lowest=True,
    )

    print("\n=== REGRESSION ERROR BY HAUL PROBABILITY ===")

    print(inspection_df
        .groupby("haul_probability_group", observed=True)
        .agg(
            players=("actual", "count"),
            actual_mean=("actual", "mean"),
            predicted_mean=("predicted", "mean"),
            haul_probability_mean=("haul_probability", "mean"),
            mae=("absolute_error", "mean"),
        )
    )

    return inspection_df

def inspect_ranking_performance(y_validation, predictions, X_validation):
    ranking_dataframe = pd.DataFrame({
        "actual": y_validation.values,
        "prediction": predictions,
        "points_per_game": X_validation["player_pointsPerGame"].values,
        "position": X_validation["player_elementType"].values
    })

    position_names = {
        1: "GK",
        2: "DEF",
        3: "MID",
        4: "FWD"
    }

    ranking_dataframe["position"] = (
        ranking_dataframe["position"]
        .map(position_names)
    )

    print("\n=== RANKING PERFORMANCE ===")

    for top_n in [5, 10, 20]:
        rf_top = ranking_dataframe.nlargest(
            top_n,
            "prediction"
        )

        ppg_top = ranking_dataframe.nlargest(
            top_n,
            "points_per_game"
        )

        print(
            f"Top {top_n} RF average actual points: "
            f"{rf_top['actual'].mean():.4f}"
        )

        print(
            f"Top {top_n} PPG average actual points: "
            f"{ppg_top['actual'].mean():.4f}"
        )

    print("\n=== RANKING PERFORMANCE BY POSITION ===")

    for position in ["GK", "DEF", "MID", "FWD"]:
        position_dataframe = ranking_dataframe[
            ranking_dataframe["position"] == position
        ]

        if len(position_dataframe) == 0:
            continue

        print(f"\n{position} ({len(position_dataframe)} players)")

        for top_n in [5, 10]:
            if len(position_dataframe) < top_n:
                continue

            rf_top = position_dataframe.nlargest(
                top_n,
                "prediction"
            )

            ppg_top = position_dataframe.nlargest(
                top_n,
                "points_per_game"
            )

            print(
                f"Top {top_n} RF average actual: "
                f"{rf_top['actual'].mean():.4f}"
            )

            print(
                f"Top {top_n} PPG average actual: "
                f"{ppg_top['actual'].mean():.4f}"
            )

def inspect_model(model, dataframe, X_train, y_train, X_validation, y_validation, feature_columns, results, predictions):
    inspect_model_data(X_train, y_train, X_validation, y_validation, feature_columns)
    
    inspect_sample_predictions(y_validation, results["predictions"])

    inspect_predictions(y_validation, results["predictions"])

    inspect_baselines(y_train, y_validation)

    inspect_feature_importance(model, X_validation, y_validation, feature_columns)

    inspect_predictions_by_minutes(X_validation, y_validation, results["predictions"])

    inspect_predictions_by_position(X_validation, y_validation, results["predictions"])

    inspect_high_scoring_players(X_validation, y_validation, results["predictions"])

    inspect_validation_features(dataframe)

    inspect_ranking_performance(y_validation, predictions, X_validation)