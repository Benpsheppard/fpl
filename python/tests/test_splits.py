import numpy as np
import pandas as pd

from services.feature_processor import split_training_data


def make_dataframe():
    return pd.DataFrame({
        "playerId": np.tile([1, 2, 3], 5),
        "gameweek": np.repeat([1, 2, 3, 4, 5], 3),
    })


def test_defaults_to_latest_gameweek_for_validation():
    train, validation = split_training_data(make_dataframe())

    assert set(validation["gameweek"]) == {5}
    assert train["gameweek"].max() == 4


def test_explicit_validation_gameweek():
    train, validation = split_training_data(make_dataframe(), 3)

    assert set(validation["gameweek"]) == {3}
    assert set(train["gameweek"]) == {1, 2}


def test_train_never_contains_validation_or_later_gameweeks():
    dataframe = make_dataframe()

    for gameweek in range(2, 6):
        train, validation = split_training_data(dataframe, gameweek)

        assert train["gameweek"].max() < gameweek
        assert set(train.index).isdisjoint(validation.index)
