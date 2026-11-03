import logging

import pandas as pd

from services.diagnostics import inspect_model_data, inspect_validation_features


def test_inspections_log_instead_of_printing(caplog, capsys):
    X = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
    y = pd.Series([1, 2])

    with caplog.at_level(logging.INFO, logger="services.diagnostics"):
        inspect_model_data(X, y, X, y, ["a", "b"])

    assert "Number of features: 2" in caplog.text
    assert capsys.readouterr().out == ""


def test_validation_feature_check_defaults_to_the_latest_gameweek(caplog):
    columns = [
        "playerId", "gameweek", "player_totalPoints", "player_pointsPerGame", "player_minutes",
        "player_expectedGoals", "player_expectedAssists", "player_bps", "player_creativity",
        "player_threat", "recent_lastGameweek_minutes", "recent_last3Gameweeks_minutes",
    ]
    dataframe = pd.DataFrame(0, index=range(4), columns=columns)
    dataframe["gameweek"] = [3, 3, 7, 7]
    dataframe["playerId"] = [101, 102, 303, 304]

    with caplog.at_level(logging.INFO, logger="services.diagnostics"):
        inspect_validation_features(dataframe)

    logged = "\n".join(record.getMessage() for record in caplog.records)
    # Only the gameweek 7 players are shown
    assert "303" in logged and "304" in logged
    assert "101" not in logged and "102" not in logged
