# feature_processor.py

# imports
import pandas as pd
import numpy as np

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
        "fixtures_opponentStrength": features["fixtures"]["opponentStrength"],

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

        # Target
        "target_totalPoints": row["target"]["totalPoints"],
    }

    return flattened

def prepare_training_dataframe(dataset):
    rows = [
        flatten_training_row(row)
        for row in dataset
    ]

    dataframe = pd.DataFrame(rows)

    return dataframe

def split_training_data(dataframe):
    train_df = dataframe[dataframe["gameweek"] < 5].copy()
    validation_df = dataframe[dataframe["gameweek"] == 5].copy()

    return train_df, validation_df  

def prepare_model_data(dataframe):
    train_df, validation_df = split_training_data(dataframe)

    target_column = "target_totalPoints"

    excluded_columns = ["playerId", "gameweek", target_column]

    feature_columns = [
        column
        for column in dataframe.columns
        if column not in excluded_columns
    ]

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

def add_features(dataframe):
    df = dataframe.copy()

    df = add_fpl_scoring_features(df)
    # df = add_form_trend_features(df)
    # df = add_minutes_trend_features(df)
    # df = add_recent_attacking_features(df)
    # df = add_historical_performance_features(df)
    # df = add_fpl_weighted_points(df)

    return df

def add_fpl_scoring_features(dataframe):
    df = dataframe.copy()

    ## Expected Goal Points - GK = 10, DEF = 6, MID = 5, FWD = 4
    goal_points = df["player_elementType"].map({
        1: 10,
        2: 6,
        3: 5,
        4: 4
    })

    df["expected_goal_points"] = (df["player_expectedGoals"] * goal_points)

    ## Expected Assist Points - 3 for all positions
    df["expected_assist_points"] = (df["player_expectedAssists"] * 3)

    ## Expected appearance points - 0mins = 0, 1-59mins = 1, 60+mins = 2
    recent_minutes = df["recent_lastGameweek_minutes"].fillna(0)

    df["expected_appearance_points"] = np.where(
        recent_minutes >= 60,
        2,
        np.where(recent_minutes > 0, 1, 0)
    )

    ## Expected Clean Sheet Points - GK = 4, DEF = 4, MID = 1, FWD = 0
    # clean_sheet_points = df["player_elementType"].map({
    #     1: 4,
    #     2: 4,
    #     3: 1,
    #     4: 0
    # })

    # clean_sheet_probability = np.exp(
    #     -df["player_expectedGoalsConceded"].fillna(0)
    # )

    # df["expected_clean_sheet_points"] = (
    #     clean_sheet_probability * clean_sheet_points
    # )

    ## Combined expected attacking points
    df["expected_attacking_points"] =(df["expected_goal_points"] + df["expected_assist_points"])

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


