# feature_processor.py

# imports
import logging
import pandas as pd
import numpy as np

from services.predictor import (train_random_forest_model, train_random_forest_classifier, evaluate_model, evaluate_predictions, generate_oof_appearance_probabilities)
from services.diagnostics import (inspect_model_data)

logger = logging.getLogger(__name__)

### Feature Prep

def flatten_training_row(row):
    features = row["features"]

    flattened = {
        # Identifiers
        "playerId": row["playerId"],
        "gameweek": row["gameweek"],

        # Recent form
        "recent_lastGameweek_gameweeks": features["recent"]["lastGameweek"]["gameweeks"],
        "recent_lastGameweek_totalPoints": features["recent"]["lastGameweek"]["totalPoints"],
        "recent_lastGameweek_minutes": features["recent"]["lastGameweek"]["minutes"],
        "recent_lastGameweek_goals": features["recent"]["lastGameweek"]["goals"],
        "recent_lastGameweek_assists": features["recent"]["lastGameweek"]["assists"],
        "recent_lastGameweek_xG": features["recent"]["lastGameweek"]["xG"],
        "recent_lastGameweek_xA": features["recent"]["lastGameweek"]["xA"],
        "recent_lastGameweek_xGI": features["recent"]["lastGameweek"]["xGI"],
        "recent_lastGameweek_starts": features["recent"]["lastGameweek"]["starts"],
        "recent_lastGameweek_appearances": features["recent"]["lastGameweek"]["appearances"],
        "recent_lastGameweek_pointsPer90": features["recent"]["lastGameweek"]["pointsPer90"],
        "recent_lastGameweek_startRate": features["recent"]["lastGameweek"]["startRate"],
        "recent_lastGameweek_appearanceRate": features["recent"]["lastGameweek"]["appearanceRate"],

        # Last 3
        "recent_last3Gameweeks_gameweeks": features["recent"]["last3Gameweeks"]["gameweeks"],
        "recent_last3Gameweeks_totalPoints": features["recent"]["last3Gameweeks"]["totalPoints"],
        "recent_last3Gameweeks_minutes": features["recent"]["last3Gameweeks"]["minutes"],
        "recent_last3Gameweeks_goals": features["recent"]["last3Gameweeks"]["goals"],
        "recent_last3Gameweeks_assists": features["recent"]["last3Gameweeks"]["assists"],
        "recent_last3Gameweeks_xG": features["recent"]["last3Gameweeks"]["xG"],
        "recent_last3Gameweeks_xA": features["recent"]["last3Gameweeks"]["xA"],
        "recent_last3Gameweeks_xGI": features["recent"]["last3Gameweeks"]["xGI"],
        "recent_last3Gameweeks_starts": features["recent"]["last3Gameweeks"]["starts"],
        "recent_last3Gameweeks_appearances": features["recent"]["last3Gameweeks"]["appearances"],
        "recent_last3Gameweeks_pointsPer90": features["recent"]["last3Gameweeks"]["pointsPer90"],
        "recent_last3Gameweeks_startRate": features["recent"]["last3Gameweeks"]["startRate"],
        "recent_last3Gameweeks_appearanceRate": features["recent"]["last3Gameweeks"]["appearanceRate"],

        # Last 5
        "recent_last5Gameweeks_gameweeks": features["recent"]["last5Gameweeks"]["gameweeks"],
        "recent_last5Gameweeks_totalPoints": features["recent"]["last5Gameweeks"]["totalPoints"],
        "recent_last5Gameweeks_minutes": features["recent"]["last5Gameweeks"]["minutes"],
        "recent_last5Gameweeks_goals": features["recent"]["last5Gameweeks"]["goals"],
        "recent_last5Gameweeks_assists": features["recent"]["last5Gameweeks"]["assists"],
        "recent_last5Gameweeks_xG": features["recent"]["last5Gameweeks"]["xG"],
        "recent_last5Gameweeks_xA": features["recent"]["last5Gameweeks"]["xA"],
        "recent_last5Gameweeks_xGI": features["recent"]["last5Gameweeks"]["xGI"],
        "recent_last5Gameweeks_starts": features["recent"]["last5Gameweeks"]["starts"],
        "recent_last5Gameweeks_appearances": features["recent"]["last5Gameweeks"]["appearances"],
        "recent_last5Gameweeks_pointsPer90": features["recent"]["last5Gameweeks"]["pointsPer90"],
        "recent_last5Gameweeks_startRate": features["recent"]["last5Gameweeks"]["startRate"],
        "recent_last5Gameweeks_appearanceRate": features["recent"]["last5Gameweeks"]["appearanceRate"],

        # Last 10
        "recent_last10Gameweeks_gameweeks": features["recent"]["last10Gameweeks"]["gameweeks"],
        "recent_last10Gameweeks_totalPoints": features["recent"]["last10Gameweeks"]["totalPoints"],
        "recent_last10Gameweeks_minutes": features["recent"]["last10Gameweeks"]["minutes"],
        "recent_last10Gameweeks_goals": features["recent"]["last10Gameweeks"]["goals"],
        "recent_last10Gameweeks_assists": features["recent"]["last10Gameweeks"]["assists"],
        "recent_last10Gameweeks_xG": features["recent"]["last10Gameweeks"]["xG"],
        "recent_last10Gameweeks_xA": features["recent"]["last10Gameweeks"]["xA"],
        "recent_last10Gameweeks_xGI": features["recent"]["last10Gameweeks"]["xGI"],
        "recent_last10Gameweeks_starts": features["recent"]["last10Gameweeks"]["starts"],
        "recent_last10Gameweeks_appearances": features["recent"]["last10Gameweeks"]["appearances"],
        "recent_last10Gameweeks_pointsPer90": features["recent"]["last10Gameweeks"]["pointsPer90"],
        "recent_last10Gameweeks_startRate": features["recent"]["last10Gameweeks"]["startRate"],
        "recent_last10Gameweeks_appearanceRate": features["recent"]["last10Gameweeks"]["appearanceRate"],

        "recent_maxPoints": features["recent"]["recentMaxPoints"],

        # Availability
        "availability_lastGameweek_minutes": features["availability"]["lastGameweek"]["minutes"],
        "availability_lastGameweek_starts": features["availability"]["lastGameweek"]["starts"],
        "availability_lastGameweek_appearances": features["availability"]["lastGameweek"]["appearances"],
        "availability_lastGameweek_minutesPerGame": features["availability"]["lastGameweek"]["minutesPerGame"],
        "availability_lastGameweek_startRate": features["availability"]["lastGameweek"]["startRate"],
        "availability_lastGameweek_appearanceRate": features["availability"]["lastGameweek"]["appearanceRate"],

        "availability_last3Gameweeks_minutes": features["availability"]["last3Gameweeks"]["minutes"],
        "availability_last3Gameweeks_starts": features["availability"]["last3Gameweeks"]["starts"],
        "availability_last3Gameweeks_appearances": features["availability"]["last3Gameweeks"]["appearances"],
        "availability_last3Gameweeks_minutesPerGame": features["availability"]["last3Gameweeks"]["minutesPerGame"],
        "availability_last3Gameweeks_startRate": features["availability"]["last3Gameweeks"]["startRate"],
        "availability_last3Gameweeks_appearanceRate": features["availability"]["last3Gameweeks"]["appearanceRate"],

        "availability_last5Gameweeks_minutes": features["availability"]["last5Gameweeks"]["minutes"],
        "availability_last5Gameweeks_starts": features["availability"]["last5Gameweeks"]["starts"],
        "availability_last5Gameweeks_appearances": features["availability"]["last5Gameweeks"]["appearances"],
        "availability_last5Gameweeks_minutesPerGame": features["availability"]["last5Gameweeks"]["minutesPerGame"],
        "availability_last5Gameweeks_startRate": features["availability"]["last5Gameweeks"]["startRate"],
        "availability_last5Gameweeks_appearanceRate": features["availability"]["last5Gameweeks"]["appearanceRate"],

        "availability_last10Gameweeks_minutes": features["availability"]["last10Gameweeks"]["minutes"],
        "availability_last10Gameweeks_starts": features["availability"]["last10Gameweeks"]["starts"],
        "availability_last10Gameweeks_appearances": features["availability"]["last10Gameweeks"]["appearances"],
        "availability_last10Gameweeks_minutesPerGame": features["availability"]["last10Gameweeks"]["minutesPerGame"],
        "availability_last10Gameweeks_startRate": features["availability"]["last10Gameweeks"]["startRate"],
        "availability_last10Gameweeks_appearanceRate": features["availability"]["last10Gameweeks"]["appearanceRate"],

        # Historical
        "historical_seasons": features["historical"]["seasons"],
        "historical_totalPoints": features["historical"]["totalPoints"],
        "historical_minutes": features["historical"]["minutes"],
        "historical_goals": features["historical"]["goals"],
        "historical_assists": features["historical"]["assists"],
        "historical_xG": features["historical"]["xG"],
        "historical_xA": features["historical"]["xA"],
        "historical_xGI": features["historical"]["xGI"],
        "historical_pointsPer90": features["historical"]["pointsPer90"],
        "historical_goalsPer90": features["historical"]["goalsPer90"],
        "historical_assistsPer90": features["historical"]["assistsPer90"],
        "historical_xGPer90": features["historical"]["xGPer90"],
        "historical_xAPer90": features["historical"]["xAPer90"],
        "historical_xGIPer90": features["historical"]["xGIPer90"],

        # Fixture
        "fixtures_isHome": int(features["fixtures"]["isHome"]),
        "fixtures_difficulty": features["fixtures"]["difficulty"],

        # Player
        "player_elementType": features["player"]["elementType"],
        "player_totalPoints": features["player"]["totalPoints"],
        "player_pointsPerGame": features["player"]["pointsPerGame"],
        "player_minutes": features["player"]["minutes"],
        "player_starts": features["player"]["starts"],
        "player_goalsScored": features["player"]["goalsScored"],
        "player_assists": features["player"]["assists"],
        "player_cleanSheets": features["player"]["cleanSheets"],
        "player_goalsConceded": features["player"]["goalsConceded"],
        "player_saves": features["player"]["saves"],
        "player_bonus": features["player"]["bonus"],
        "player_bps": features["player"]["bps"],
        "player_expectedGoals": features["player"]["expectedGoals"],
        "player_expectedAssists": features["player"]["expectedAssists"],
        "player_expectedGoalInvolvements": features["player"]["expectedGoalInvolvements"],
        "player_expectedGoalsConceded": features["player"]["expectedGoalsConceded"],
        "player_influence": features["player"]["influence"],
        "player_creativity": features["player"]["creativity"],
        "player_threat": features["player"]["threat"],
        "player_ictIndex": features["player"]["ictIndex"],
        "player_yellowCards": features["player"]["yellowCards"],
        "player_redCards": features["player"]["redCards"],
        "player_clearancesBlocksInterceptions": features["player"]["clearancesBlocksInterceptions"],
        "player_recoveries": features["player"]["recoveries"],
        "player_tackles": features["player"]["tackles"],
        "player_defensiveContribution": features["player"]["defensiveContribution"],
        "player_pointsPer90": features["player"]["pointsPer90"],
        "player_value": features["player"]["value"],
        "player_selected": features["player"]["selected"],
        "player_transfersIn": features["player"]["transfersIn"],
        "player_transfersOut": features["player"]["transfersOut"],
        "player_ownGoals": features["player"]["ownGoals"],
        "player_penaltiesSaved": features["player"]["penaltiesSaved"],
        "player_penaltiesMissed": features["player"]["penaltiesMissed"],
        "player_defensiveActions": features["player"]["defensiveActions"],
        "player_defensiveActionsPer90": features["player"]["defensiveActionsPer90"],

        # Team - Overall
        "team_overall_matches": features["team"]["overall"]["matches"],
        "team_overall_goalsScoredPerMatch": features["team"]["overall"]["goalsScoredPerMatch"],
        "team_overall_goalsConcededPerMatch": features["team"]["overall"]["goalsConcededPerMatch"],
        "team_overall_winRate": features["team"]["overall"]["winRate"],
        "team_overall_drawRate": features["team"]["overall"]["drawRate"],
        "team_overall_lossRate": features["team"]["overall"]["lossRate"],
        "team_overall_cleanSheetRate": features["team"]["overall"]["cleanSheetRate"],
        "team_overall_pointsPerMatch": features["team"]["overall"]["pointsPerMatch"],

        # Team - Home/Away
        "team_venue_matches": features["team"]["venue"]["matches"],
        "team_venue_goalsScoredPerMatch": features["team"]["venue"]["goalsScoredPerMatch"],
        "team_venue_goalsConcededPerMatch": features["team"]["venue"]["goalsConcededPerMatch"],
        "team_venue_winRate": features["team"]["venue"]["winRate"],
        "team_venue_drawRate": features["team"]["venue"]["drawRate"],
        "team_venue_lossRate": features["team"]["venue"]["lossRate"],
        "team_venue_cleanSheetRate": features["team"]["venue"]["cleanSheetRate"],
        "team_venue_pointsPerMatch": features["team"]["venue"]["pointsPerMatch"],

        # Opponent - Overall
        "team_opponentOverall_matches": features["team"]["opponentOverall"]["matches"],
        "team_opponentOverall_goalsScoredPerMatch": features["team"]["opponentOverall"]["goalsScoredPerMatch"],
        "team_opponentOverall_goalsConcededPerMatch": features["team"]["opponentOverall"]["goalsConcededPerMatch"],
        "team_opponentOverall_winRate": features["team"]["opponentOverall"]["winRate"],
        "team_opponentOverall_drawRate": features["team"]["opponentOverall"]["drawRate"],
        "team_opponentOverall_lossRate": features["team"]["opponentOverall"]["lossRate"],
        "team_opponentOverall_cleanSheetRate": features["team"]["opponentOverall"]["cleanSheetRate"],
        "team_opponentOverall_pointsPerMatch": features["team"]["opponentOverall"]["pointsPerMatch"],

        # Opponent - Home/Away
        "team_opponentVenue_matches": features["team"]["opponentVenue"]["matches"],
        "team_opponentVenue_goalsScoredPerMatch": features["team"]["opponentVenue"]["goalsScoredPerMatch"],
        "team_opponentVenue_goalsConcededPerMatch": features["team"]["opponentVenue"]["goalsConcededPerMatch"],
        "team_opponentVenue_winRate": features["team"]["opponentVenue"]["winRate"],
        "team_opponentVenue_drawRate": features["team"]["opponentVenue"]["drawRate"],
        "team_opponentVenue_lossRate": features["team"]["opponentVenue"]["lossRate"],
        "team_opponentVenue_cleanSheetRate": features["team"]["opponentVenue"]["cleanSheetRate"],
        "team_opponentVenue_pointsPerMatch": features["team"]["opponentVenue"]["pointsPerMatch"],

        # Target (absent for prediction rows, where the gameweek has not been played)
        "target_totalPoints": (row.get("target") or {}).get("totalPoints"),
        "target_totalMinutes": (row.get("target") or {}).get("totalMinutes")
    }

    return flattened

# Stage 1's output, fed to stage 2 as a feature
PROBABILITY_COLUMN = "predicted_appearance_probability"

# Columns that never go into a model, whatever the feature set
IDENTIFIER_COLUMNS = ["playerId", "gameweek"]

CLASSIFIER_FEATURES = [
    "recent_lastGameweek_minutes",
    "recent_lastGameweek_starts",
    "recent_lastGameweek_appearances",
    "recent_lastGameweek_pointsPer90",
    "recent_lastGameweek_startRate",
    "recent_lastGameweek_appearanceRate",

    "recent_last3Gameweeks_minutes",
    "recent_last3Gameweeks_starts",
    "recent_last3Gameweeks_appearances",
    "recent_last3Gameweeks_pointsPer90",
    "recent_last3Gameweeks_startRate",
    "recent_last3Gameweeks_appearanceRate",

    "recent_last5Gameweeks_minutes",
    "recent_last5Gameweeks_starts",
    "recent_last5Gameweeks_appearances",
    "recent_last5Gameweeks_pointsPer90",
    "recent_last5Gameweeks_startRate",
    "recent_last5Gameweeks_appearanceRate",

    "recent_last10Gameweeks_minutes",
    "recent_last10Gameweeks_starts",
    "recent_last10Gameweeks_appearances",
    "recent_last10Gameweeks_pointsPer90",
    "recent_last10Gameweeks_startRate",
    "recent_last10Gameweeks_appearanceRate",

    "availability_lastGameweek_minutes",
    "availability_lastGameweek_starts",
    "availability_lastGameweek_appearances",
    "availability_lastGameweek_minutesPerGame",
    "availability_lastGameweek_startRate",
    "availability_lastGameweek_appearanceRate",

    "availability_last3Gameweeks_minutes",
    "availability_last3Gameweeks_starts",
    "availability_last3Gameweeks_appearances",
    "availability_last3Gameweeks_minutesPerGame",
    "availability_last3Gameweeks_startRate",
    "availability_last3Gameweeks_appearanceRate",

    "availability_last5Gameweeks_minutes",
    "availability_last5Gameweeks_starts",
    "availability_last5Gameweeks_appearances",
    "availability_last5Gameweeks_minutesPerGame",
    "availability_last5Gameweeks_startRate",
    "availability_last5Gameweeks_appearanceRate",

    "availability_last10Gameweeks_minutes",
    "availability_last10Gameweeks_starts",
    "availability_last10Gameweeks_appearances",
    "availability_last10Gameweeks_minutesPerGame",
    "availability_last10Gameweeks_startRate",
    "availability_last10Gameweeks_appearanceRate",

    "historical_minutes",

    "player_minutes",
    "player_starts",
]

# Regressor features are every column except these. A new column from
# add_features or the Node dataset is therefore included by default, so check
# it for leakage before running validation.
REGRESSOR_EXCLUDED_FEATURES = [    
    "recent_lastGameweek_gameweeks",
    "recent_lastGameweek_totalPoints",
    "recent_lastGameweek_minutes",
    # "recent_lastGameweek_goals",
    # "recent_lastGameweek_assists",
    "recent_lastGameweek_xG",
    "recent_lastGameweek_xA",
    # "recent_lastGameweek_xGI",
    "recent_lastGameweek_starts",
    "recent_lastGameweek_appearances",
    "recent_lastGameweek_pointsPer90",
    "recent_lastGameweek_startRate",
    "recent_lastGameweek_appearanceRate",

    "recent_last3Gameweeks_gameweeks",
    "recent_last3Gameweeks_totalPoints",
    "recent_last3Gameweeks_minutes",
    # "recent_last3Gameweeks_goals",
    # "recent_last3Gameweeks_assists",
    "recent_last3Gameweeks_xG",
    "recent_last3Gameweeks_xA",
    # "recent_last3Gameweeks_xGI",
    "recent_last3Gameweeks_starts",
    "recent_last3Gameweeks_appearances",
    "recent_last3Gameweeks_pointsPer90",
    "recent_last3Gameweeks_startRate",
    "recent_last3Gameweeks_appearanceRate",

    "recent_last5Gameweeks_gameweeks",
    "recent_last5Gameweeks_totalPoints",
    "recent_last5Gameweeks_minutes",
    # "recent_last5Gameweeks_goals",
    # "recent_last5Gameweeks_assists",
    "recent_last5Gameweeks_xG",
    "recent_last5Gameweeks_xA",
    # "recent_last5Gameweeks_xGI",
    "recent_last5Gameweeks_starts",
    "recent_last5Gameweeks_appearances",
    "recent_last5Gameweeks_pointsPer90",
    "recent_last5Gameweeks_startRate",
    "recent_last5Gameweeks_appearanceRate",

    "recent_last10Gameweeks_gameweeks",
    "recent_last10Gameweeks_totalPoints",
    "recent_last10Gameweeks_minutes",
    # "recent_last10Gameweeks_goals",
    # "recent_last10Gameweeks_assists",
    "recent_last10Gameweeks_xG",
    "recent_last10Gameweeks_xA",
    # "recent_last10Gameweeks_xGI",
    "recent_last10Gameweeks_starts",
    "recent_last10Gameweeks_appearances",
    "recent_last10Gameweeks_pointsPer90",
    "recent_last10Gameweeks_startRate",
    "recent_last10Gameweeks_appearanceRate",

    # "recent_maxPoints",

    "availability_lastGameweek_minutes",
    "availability_lastGameweek_starts",
    "availability_lastGameweek_appearances",
    "availability_lastGameweek_minutesPerGame",
    "availability_lastGameweek_startRate",
    "availability_lastGameweek_appearanceRate",

    "availability_last3Gameweeks_minutes",
    "availability_last3Gameweeks_starts",
    "availability_last3Gameweeks_appearances",
    "availability_last3Gameweeks_minutesPerGame",
    "availability_last3Gameweeks_startRate",
    "availability_last3Gameweeks_appearanceRate",

    "availability_last5Gameweeks_minutes",
    "availability_last5Gameweeks_starts",
    "availability_last5Gameweeks_appearances",
    "availability_last5Gameweeks_minutesPerGame",
    "availability_last5Gameweeks_startRate",
    "availability_last5Gameweeks_appearanceRate",

    "availability_last10Gameweeks_minutes",
    "availability_last10Gameweeks_starts",
    "availability_last10Gameweeks_appearances",
    "availability_last10Gameweeks_minutesPerGame",
    "availability_last10Gameweeks_startRate",
    "availability_last10Gameweeks_appearanceRate",

    "historical_seasons",
    "historical_totalPoints",
    "historical_minutes",
    # "historical_goals",
    # "historical_assists",
    # "historical_xG",
    # "historical_xA",
    # "historical_xGI",
    # "historical_pointsPer90",
    # "historical_goalsPer90",
    # "historical_assistsPer90",
    # "historical_xGPer90",
    # "historical_xAPer90",
    # "historical_xGIPer90",

    "fixtures_isHome",
    "fixtures_difficulty",

    # "player_elementType",
    # "player_totalPoints",
    # "player_pointsPerGame",
    "player_minutes",
    "player_starts",
    # "player_goalsScored",
    # "player_assists",
    # "player_cleanSheets",
    # "player_goalsConceded",
    "player_saves",
    "player_bonus",
    # "player_bps",
    "player_expectedGoals",
    "player_expectedAssists",
    "player_expectedGoalInvolvements",
    "player_expectedGoalsConceded",
    "player_influence",
    "player_creativity",
    "player_threat",
    "player_ictIndex",
    "player_yellowCards",
    "player_redCards",
    "player_clearancesBlocksInterceptions",
    "player_recoveries",
    "player_tackles",
    # "player_defensiveContribution",
    "player_pointsPer90",
    # "player_value",
    # "player_selected",
    "player_transfersIn",
    # "player_transfersOut",
    "player_ownGoals",
    "player_penaltiesSaved",
    "player_penaltiesMissed",
    "player_defensiveActions",
    "player_defensiveActionsPer90",

    # "team_overall_matches",
    # "team_overall_goalsScoredPerMatch",
    # "team_overall_goalsConcededPerMatch",
    "team_overall_winRate",
    "team_overall_drawRate",
    "team_overall_lossRate",
    "team_overall_cleanSheetRate",
    "team_overall_pointsPerMatch",

    # "team_venue_matches",
    # "team_venue_goalsScoredPerMatch",
    # "team_venue_goalsConcededPerMatch",
    "team_venue_winRate",
    "team_venue_drawRate",
    "team_venue_lossRate",
    "team_venue_cleanSheetRate",
    "team_venue_pointsPerMatch",

    # "team_opponentOverall_matches",
    # "team_opponentOverall_goalsScoredPerMatch",
    # "team_opponentOverall_goalsConcededPerMatch",
    "team_opponentOverall_winRate",
    "team_opponentOverall_drawRate",
    "team_opponentOverall_lossRate",
    "team_opponentOverall_cleanSheetRate",
    "team_opponentOverall_pointsPerMatch",
    
    "team_opponentVenue_matches",
    "team_opponentVenue_goalsScoredPerMatch",
    "team_opponentVenue_goalsConcededPerMatch",
    "team_opponentVenue_winRate",
    "team_opponentVenue_drawRate",
    "team_opponentVenue_lossRate",
    "team_opponentVenue_cleanSheetRate",
    "team_opponentVenue_pointsPerMatch",

    # "expected_goal_points",
    # "expected_assist_points",
    # "expected_appearance_points",
    # "expected_attacking_points",
    "expected_clean_sheet_points",
    # "expected_defcon_points",
    # "expected_defensive_points",
]

def select_regressor_features(dataframe):
    feature_columns = [
        column
        for column in dataframe.columns
        if column not in IDENTIFIER_COLUMNS
        and not column.startswith("target_")
        and column not in REGRESSOR_EXCLUDED_FEATURES
    ]

    if not feature_columns:
        raise ValueError("No regressor features were found")

    return feature_columns

def select_classifier_features(dataframe):
    feature_columns = [
        column
        for column in CLASSIFIER_FEATURES
        if column in dataframe.columns
    ]

    if not feature_columns:
        raise ValueError("No classifier features were found")

    assert not any(column.startswith("target_") for column in feature_columns), "Target leakage detected"

    return feature_columns

def prepare_training_dataframe(dataset):
    rows = [
        flatten_training_row(row)
        for row in dataset
    ]

    dataframe = pd.DataFrame(rows)

    return dataframe

### Classifier RF Prep

def prepare_classifier_model_data(dataframe, validation_gameweek=None):
    # Chronological split: train on earlier gameweeks, validate on one gameweek
    train_df, validation_df = split_training_data(dataframe, validation_gameweek)

    target_column = "target_totalMinutes"

    feature_columns = select_classifier_features(dataframe)

    if train_df.empty or validation_df.empty:
        raise ValueError(f"Insufficient data for GW{validation_gameweek}")

    # Out-of-fold probabilities only use earlier gameweeks within the training set
    oof_probabilities = generate_oof_appearance_probabilities(train_df, feature_columns)

    X_train = train_df[feature_columns].copy()
    y_train = (train_df[target_column] > 0).astype(int)

    X_validation = validation_df[feature_columns].copy()
    y_validation = (validation_df[target_column] > 0).astype(int)

    return (
        X_train,
        y_train,
        X_validation,
        y_validation,
        feature_columns,
        oof_probabilities
    )

### Standard RF Prep

def split_training_data(dataframe, validation_gameweek=None):
    # Default to validating on the latest gameweek in the data
    if validation_gameweek is None:
        validation_gameweek = int(dataframe["gameweek"].max())

    train_df = dataframe[dataframe["gameweek"] < validation_gameweek].copy()
    validation_df = dataframe[dataframe["gameweek"] == validation_gameweek].copy()

    return train_df, validation_df

def prepare_model_data(dataframe, validation_gameweek=None):
    train_df, validation_df = split_training_data(dataframe, validation_gameweek)

    target_column = "target_totalPoints"

    feature_columns = select_regressor_features(dataframe)

    X_train = train_df[feature_columns]
    y_train = train_df[target_column]

    X_validation = validation_df[feature_columns]
    y_validation = validation_df[target_column]

    return (
        X_train,
        y_train,
        X_validation,
        y_validation,
        feature_columns
    )

def run_rolling_validation(dataframe, start_gameweek=5, end_gameweek=None):
    if end_gameweek is None:
        end_gameweek = int(dataframe["gameweek"].max())

    results = []

    for validation_gameweek in range(start_gameweek, end_gameweek + 1):
        logger.info(f"\n=== VALIDATION GAMEWEEK {validation_gameweek} ===")

        (X_train, y_train, X_validation, y_validation, feature_columns) = prepare_model_data(dataframe, validation_gameweek)

        if len(X_train) == 0 or len(X_validation) == 0:
            logger.info("Skipping - insufficient data")
            continue
        
        model = train_random_forest_model(X_train, y_train)
        model_results = evaluate_model(model, X_validation, y_validation)

        logger.info(f"Train rows: {len(X_train)}")
        logger.info(f"Validation rows: {len(X_validation)}")
        logger.info(f"MAE: {model_results['mae']:.4f}")
        logger.info(f"RMSE: {model_results['rmse']:.4f}")
        logger.info(f"R2: {model_results['r2']:.4f}")

        results.append({
            "gameweek": validation_gameweek,
            "train_rows": len(X_train),
            "validation_rows": len(X_validation),
            "mae": model_results["mae"],
            "rmse": model_results["rmse"],
            "r2": model_results["r2"]
        })

    results_dataframe = pd.DataFrame(results)

    logger.info("\n=== ROLLING VALIDATION SUMMARY ===")

    logger.info(
        f"Average MAE: "
        f"{results_dataframe['mae'].mean():.4f}"
    )

    logger.info(
        f"Average RMSE: "
        f"{results_dataframe['rmse'].mean():.4f}"
    )

    logger.info(
        f"Average R2: "
        f"{results_dataframe['r2'].mean():.4f}"
    )

    logger.info("\n=== RESULTS BY GAMEWEEK ===")

    logger.info(results_dataframe.to_string(index=False))

    return results_dataframe

### Rolling Two-stage Prep

def fit_two_stage_fold(dataframe, validation_gameweek):
    """Fit both stages on gameweeks before validation_gameweek and predict that gameweek.

    Returns None when there is no data to train or validate on. Otherwise returns the
    regressor's training rows (with the appearance probability column), the validation
    rows, the actual points, and the two-stage predictions.
    """
    train_df, validation_df = split_training_data(dataframe, validation_gameweek)

    if train_df.empty or validation_df.empty:
        return None

    # STAGE 1: Appearance classifier
    (X_classifier_train, y_classifier_train, X_classifier_validation, y_classifier_validation, classifier_features, oof_probabilities) = prepare_classifier_model_data(dataframe, validation_gameweek)

    # STAGE 2: Points regressor data
    (X_train, y_train, X_validation, y_validation, feature_columns) = prepare_model_data(dataframe, validation_gameweek)

    # Prevent target leakage
    for columns in [X_classifier_train.columns, X_classifier_validation.columns, X_train.columns, X_validation.columns]:
        assert not any(col.startswith("target_") for col in columns), "Target leakage detected"

    assert oof_probabilities.index.is_unique
    assert X_train.index.is_unique
    assert X_validation.index.is_unique

    # Fit classifier on all previous gameweeks
    classifier = train_random_forest_classifier(X_classifier_train, y_classifier_train)

    validation_probabilities = pd.Series(
        classifier.predict_proba(X_classifier_validation)[:, 1],
        index=X_classifier_validation.index
    )

    # Copy to avoid modifying original dataframes
    X_train = X_train.copy()
    X_validation = X_validation.copy()

    # Training probabilities come from earlier gameweeks only (out-of-fold)
    X_train[PROBABILITY_COLUMN] = oof_probabilities.reindex(X_train.index)
    X_validation[PROBABILITY_COLUMN] = validation_probabilities.reindex(X_validation.index)

    # The earliest gameweeks have no earlier data to score them
    usable_indices = X_train[PROBABILITY_COLUMN].dropna().index

    X_train = X_train.loc[usable_indices]
    y_train = y_train.loc[usable_indices]

    # Validation must include every player
    if X_validation[PROBABILITY_COLUMN].isna().any():
        raise ValueError(f"Missing validation probabilities for GW{validation_gameweek}")

    if X_train.empty:
        return None

    # Both stages must cover the same validation rows
    if set(X_validation.index) != set(X_classifier_validation.index):
        raise ValueError("Classifier and regressor validation rows do not match")

    regressor = train_random_forest_model(X_train, y_train)

    return {
        "X_train": X_train,
        "y_train": y_train,
        "X_validation": X_validation,
        "y_validation": y_validation,
        "predictions": pd.Series(regressor.predict(X_validation), index=X_validation.index),
    }

def run_rolling_two_stage_validation(dataframe, start_gameweek=2, end_gameweek=None):
    if end_gameweek is None:
        end_gameweek = int(dataframe["gameweek"].max())

    results = []

    for validation_gameweek in range(start_gameweek, end_gameweek + 1):
        logger.info(f"\n=== TWO-STAGE VALIDATION GW" f"{validation_gameweek} ===")

        fold = fit_two_stage_fold(dataframe, validation_gameweek)

        if fold is None:
            logger.info("Skipping: insufficient data")
            continue

        model_results = evaluate_predictions(fold["y_validation"], fold["predictions"])

        logger.info(f"Training rows: {len(fold['X_train'])}")
        logger.info(f"Validation rows: {len(fold['X_validation'])}")
        logger.info(f"Features: {len(fold['X_train'].columns)}")
        logger.info(f"MAE: {model_results['mae']:.4f}")
        logger.info(f"RMSE: {model_results['rmse']:.4f}")
        logger.info(f"R2: {model_results['r2']:.4f}")

        results.append({
            "gameweek": validation_gameweek,
            "train_rows": len(fold["X_train"]),
            "validation_rows": len(fold["X_validation"]),
            "features": len(fold["X_train"].columns),
            "mae": model_results["mae"],
            "rmse": model_results["rmse"],
            "r2": model_results["r2"]
        })

    results_dataframe = pd.DataFrame(results)

    logger.info("\n=== TWO-STAGE ROLLING SUMMARY ===")

    if not results_dataframe.empty:
        logger.info(results_dataframe.to_string(index=False))
        logger.info(
            "Average MAE: %s",
            results_dataframe["mae"].mean()
        )
        logger.info(
            "Average RMSE: %s",
            results_dataframe["rmse"].mean()
        )
        logger.info(
            "Average R2: %s",
            results_dataframe["r2"].mean()
        )

    return results_dataframe

### Additional Features ###

def add_features(dataframe):
    df = dataframe.copy()

    df = add_fpl_scoring_features(df)
    # df = add_form_trend_features(df)
    # df = add_minutes_trend_features(df)
    # df = add_recent_attacking_features(df)
    # df = add_historical_performance_features(df)
    # df = add_fpl_weighted_points(df)
    # df = add_player_per90_features(df)
    # df = add_performance_vs_expected_features(df)

    return df

def add_fpl_scoring_features(dataframe):
    df = dataframe.copy()

    position = df["player_elementType"]

    goal_points = position.map({
        1: 10,  # Goalkeeper
        2: 6,   # Defender
        3: 5,   # Midfielder
        4: 4    # Forward
    })

    df["expected_goal_points"] = (
        df["player_expectedGoals"] * goal_points
    )

    df["expected_assist_points"] = (
        df["player_expectedAssists"] * 3
    )

    recent_minutes = df["recent_lastGameweek_minutes"].fillna(0)

    df["expected_appearance_points"] = np.where(
        recent_minutes >= 60, 2,
        np.where(recent_minutes > 0, 1, 0)
    )

    df["expected_attacking_points"] = (
        df["expected_goal_points"]
        + df["expected_assist_points"]
    )

    matches_played = (df["player_minutes"] / 90).clip(lower=1)

    clean_sheet_rate = (df["player_cleanSheets"] / matches_played).clip(0, 1)
    clean_sheet_points = position.map({
        1: 4, # GK
        2: 4, # DEF
        3: 1, # MID
        4: 0  # ATK
    }).fillna(0)

    df["expected_clean_sheet_points"] = (clean_sheet_rate * clean_sheet_points)

    defensive_actions = (
        df["player_clearancesBlocksInterceptions"].fillna(0) + 
        df["player_tackles"].fillna(0) + 
        np.where(
            position.isin([3, 4]),
            df["player_recoveries"].fillna(0), 
            0    
        ) 
    )

    defensive_actions_per90 = (defensive_actions / matches_played)

    defcon_threshold = np.where(position == 2, 10, 12)

    df["expected_defcon_points"] = np.where(
        position.isin([2, 3, 4]),
        2 * np.clip(
            defensive_actions_per90 / defcon_threshold,
            0, 1
        ),
        0
    )

    df["expected_defensive_points"] = (
        df["expected_clean_sheet_points"] +
        df["expected_defcon_points"]
    )

    return df

def add_form_trend_features(dataframe):
    df = dataframe.copy()

    recent5_minutes = df["recent_last5Gameweeks_minutes"]

    recent5_xGPer90 = np.where(
        recent5_minutes > 0,
        df["recent_last5Gameweeks_xG"] / recent5_minutes * 90,
        0
    )

    recent5_xAPer90 = np.where(
        recent5_minutes > 0,
        df["recent_last5Gameweeks_xA"] / recent5_minutes * 90,
        0
    )

    recent5_xGIPer90 = np.where(
        recent5_minutes > 0,
        df["recent_last5Gameweeks_xGI"] / recent5_minutes * 90,
        0
    )

    df["recent5_xGPer90_trend"] = (
        recent5_xGPer90 - df["historical_xGPer90"]
    )

    df["recent5_xAPer90_trend"] = (
        recent5_xAPer90 - df["historical_xAPer90"]
    )

    df["recent5_xGIPer90_trend"] = (
        recent5_xGIPer90 - df["historical_xGIPer90"]
    )

    return df

def add_minutes_trend_features(dataframe):
    df = dataframe.copy()

    df["recent3_minutes_rate_vs_recent10"] = (
        df["recent_last3Gameweeks_minutes"] /
        df["recent_last10Gameweeks_minutes"].replace(0, np.nan)
    )

    df["recent5_minutes_rate_vs_recent10"] = (
        df["recent_last5Gameweeks_minutes"] /
        df["recent_last10Gameweeks_minutes"].replace(0, np.nan)
    )

    df["recent5_minutes_rate_vs_historical"] = (
        df["recent_last5Gameweeks_minutes"] /
        df["historical_minutes"].replace(0, np.nan)
    )

    return df.replace([np.inf, -np.inf], np.nan).fillna(0)

def add_recent_attacking_features(dataframe):
    df = dataframe.copy()

    minutes = df["recent_last5Gameweeks_minutes"]

    df["recent5_xGPer90"] = np.where(
        minutes > 0,
        df["recent_last5Gameweeks_xG"] / minutes * 90,
        0
    )

    df["recent5_xAPer90"] = np.where(
        minutes > 0,
        df["recent_last5Gameweeks_xA"] / minutes * 90,
        0
    )

    df["recent5_xGIPer90"] = np.where(
        minutes > 0,
        df["recent_last5Gameweeks_xGI"] / minutes * 90,
        0
    )

    return df

def add_historical_performance_features(dataframe):
    df = dataframe.copy()

    def calculate_average_points(row):
        target_difficulty = row["fixtures_difficulty"]

        matching_points = [
            performance["points"]
            for performance in row["historical_fixture_performance"]
            if performance["difficulty"] == target_difficulty
        ]

        if not matching_points:
            return 0

        return sum(matching_points) / len(matching_points)

    df["historical_points_vs_fixture_difficulty"] = (
        df.apply(
            calculate_average_points,
            axis = 1
        )
    )

    df = df.drop(
        columns=["historical_fixture_performance"]
    )

    return df

def add_fpl_weighted_points(dataframe):
    df = dataframe.copy()

    df["expected_fpl_points_weighted"] = (
        df["expected_goal_points"] * 1.5
        + df["expected_assist_points"] * 1.25
        + df["expected_appearance_points"]
    )

    return df

def add_player_per90_features(dataframe):
    df = dataframe.copy()

    minutes = df["player_minutes"].replace(0, np.nan)

    per90_features = {
        "player_expectedGoalInvolvements": "player_xGIPer90",
        "player_bps": "player_bpsPer90",
    }

    for source, target in per90_features.items():
        df[target] = (df[source] / minutes * 90).fillna(0)

    return df

def add_performance_vs_expected_features(dataframe):
    df = dataframe.copy()

    df["player_goalsMinusXG"] = (
        df["player_goalsScored"]
        - df["player_expectedGoals"]
    )

    df["player_assistsMinusXA"] = (
        df["player_assists"]
        - df["player_expectedAssists"]
    )

    df["player_goalInvolvementsMinusXGI"] = (
        df["player_goalsScored"]
        + df["player_assists"]
        - df["player_expectedGoalInvolvements"]
    )

    return df