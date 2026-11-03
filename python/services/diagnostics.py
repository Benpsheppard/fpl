# diagnostics.py

# imports
import logging
import pandas as pd
from sklearn.inspection import permutation_importance

logger = logging.getLogger(__name__)

## Inspect functions

def inspect_model_data(X_train, y_train, X_validation, y_validation, feature_columns):
    logger.info("\n=== MODEL DATA ===")

    logger.info(f"Training features: {X_train.shape}")
    logger.info(f"Validation features: {X_validation.shape}")
    logger.info(f"Number of features: {len(feature_columns)}")

    logger.info("\n=== FEATURE TYPES ===")
    logger.info(X_train.dtypes.value_counts())

    logger.info("\n=== FEATURES ===")
    for column in feature_columns:
        logger.info(column)

    logger.info("\n=== TARGET ===")
    logger.info(f"Training target shape: {y_train.shape}")
    logger.info(f"Validation target shape: {y_validation.shape}")

def inspect_row(dataframe, row_index=0):
    row = dataframe.iloc[row_index]

    logger.info(f"\n=== DATAFRAME ROW {row_index} ===")

    for column, value in row.items():
        logger.info(f"{column}: {value}")

def inspect_sample_predictions(y_actual, predictions, count=20):
    logger.info("\n=== SAMPLE PREDICTIONS ===")

    for actual, prediction in zip(y_actual.iloc[:count], predictions[:count]):
        logger.info(
            f"Actual: {actual:>5.1f} | "
            f"Predicted: {prediction:>6.2f}"
        )

def inspect_predictions(y_actual, predictions):
    prediction_df = pd.DataFrame({ "actual": y_actual.to_numpy(), "predicted": predictions, })

    prediction_df["error"] = (prediction_df["predicted"] - prediction_df["actual"])
    prediction_df["absolute_error"] = (prediction_df["error"].abs())

    logger.info("\n=== PREDICTION DISTRIBUTION ===")
    logger.info(prediction_df["predicted"].describe())

    logger.info("\n=== ACTUAL vs PREDICTED ===")
    logger.info(prediction_df[["actual", "predicted"]].describe())

    logger.info("\n=== NEGATIVE PREDICTIONS ===")
    negative_predictions = (prediction_df["predicted"] < 0).sum()

    logger.info(f"{negative_predictions} / {len(prediction_df)} " f"({negative_predictions / len(prediction_df):.1%})")

    logger.info("\n=== MEAN ERROR ===")
    logger.info(f"{prediction_df['error'].mean():.4f}")

    logger.info("\n=== MAE BY ACTUAL SCORE ===")
    logger.info( prediction_df.groupby("actual")["absolute_error"].agg(["count", "mean"]).head(15))

    logger.info("\n=== LARGEST ERRORS ===")
    logger.info(prediction_df.sort_values("absolute_error", ascending=False).head(20).to_string(index=False))

    return prediction_df

def inspect_feature_importance(model, X_validation, y_validation, feature_columns):
    importance = permutation_importance(model, X_validation, y_validation, scoring="neg_mean_absolute_error", n_repeats=10, random_state=42)
    
    importance_df = pd.DataFrame({
        "feature": feature_columns,
        "importance_mean": importance.importances_mean,
        "importance_std": importance.importances_std
    })

    importance_df = importance_df.sort_values( "importance_mean", ascending = False )

    logger.info("\n=== TOP FEATURES ===")
    logger.info(importance_df.to_string(index=False))

    return importance_df

def inspect_validation_features(dataframe, validation_gameweek=None):
    # Default to the latest gameweek, which is what the standard split validates on
    if validation_gameweek is None:
        validation_gameweek = int(dataframe["gameweek"].max())

    validation_df = dataframe[dataframe["gameweek"] == validation_gameweek].copy()

    logger.info("\n=== VALIDATION FEATURE CHECK ===")

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

    logger.info(validation_df[columns] .head(20) .to_string(index=False))

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

    ranking_dataframe["position"] = (ranking_dataframe["position"].map(position_names))

    logger.info("\n=== RANKING PERFORMANCE ===")
    for top_n in [5, 10, 20]:
        rf_top = ranking_dataframe.nlargest(top_n, "prediction")
        ppg_top = ranking_dataframe.nlargest(top_n, "points_per_game")

        logger.info(f"Top {top_n} RF average actual points: " f"{rf_top['actual'].mean():.4f}")
        logger.info(f"Top {top_n} PPG average actual points: " f"{ppg_top['actual'].mean():.4f}")

    logger.info("\n=== RANKING PERFORMANCE BY POSITION ===")
    for position in ["GK", "DEF", "MID", "FWD"]:
        position_dataframe = ranking_dataframe[ranking_dataframe["position"] == position]

        if len(position_dataframe) == 0:
            continue

        logger.info(f"\n{position} ({len(position_dataframe)} players)")
        for top_n in [5, 10]:
            if len(position_dataframe) < top_n:
                continue

            rf_top = position_dataframe.nlargest(top_n, "prediction")

            ppg_top = position_dataframe.nlargest(top_n, "points_per_game")

            logger.info(f"Top {top_n} RF average actual: " f"{rf_top['actual'].mean():.4f}")

            logger.info(f"Top {top_n} PPG average actual: " f"{ppg_top['actual'].mean():.4f}")

def inspect_split(train_df, validation_df):
    logger.info("\n=== TRAINING SET ===")
    logger.info(f"Rows: {len(train_df)}")
    logger.info(f"Gameweeks: {sorted(train_df['gameweek'].unique())}")
    logger.info(train_df["target_totalPoints"].describe())

    logger.info("\n=== VALIDATION SET ===")
    logger.info(f"Rows: {len(validation_df)}")
    logger.info(f"Gameweeks: {sorted(validation_df['gameweek'].unique())}")
    logger.info(validation_df["target_totalPoints"].describe())

def inspect_training_dataframe(dataframe):
    logger.info("\n=== DATASET SHAPE ===")
    logger.info(f"Rows: {len(dataframe)}")
    logger.info(f"Columns: {len(dataframe.columns)}")

    logger.info("\n=== GAMEWEEK DISTRIBUTION ===")
    logger.info(dataframe["gameweek"].value_counts().sort_index())

    logger.info("\n=== TARGET ===")
    logger.info(dataframe["target_totalPoints"].describe())

    logger.info("\n=== MISSING VALUES ===")
    missing = dataframe.isna().sum()
    missing = missing[missing > 0].sort_values(ascending=False)

    if missing.empty:
        logger.info("No missing values.")
    else:
        logger.info(missing)

    logger.info("\n=== UNIQUE VALUES ===")
    for column in [ "playerId", "gameweek", "fixtures_isHome", "fixtures_difficulty", "player_elementType" ]:
        logger.info(f"{column}: {dataframe[column].nunique()} unique values")

    logger.info("\n=== SAMPLES ===")
    logger.info(dataframe.head(3).to_string())

## Inspect Model Endpoint

def inspect_model(model, dataframe, X_train, y_train, X_validation, y_validation, feature_columns, results, predictions):
    inspect_model_data(X_train, y_train, X_validation, y_validation, feature_columns)

    # inspect_row(dataframe, 411)
    
    inspect_sample_predictions(y_validation, results["predictions"])

    inspect_predictions(y_validation, results["predictions"])

    inspect_feature_importance(model, X_validation, y_validation, feature_columns)

    inspect_validation_features(dataframe)

    inspect_ranking_performance(y_validation, predictions, X_validation)