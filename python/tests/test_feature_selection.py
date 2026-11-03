import numpy as np
import pandas as pd
import pytest

from services import feature_processor as fp


@pytest.fixture
def dataframe():
    rng = np.random.default_rng(0)
    columns = (
        fp.CLASSIFIER_FEATURES[:5]
        + ["brand_new_feature", "playerId", "gameweek", "target_totalPoints", "target_totalMinutes"]
    )
    df = pd.DataFrame(rng.random((40, len(columns))), columns=columns)
    df["gameweek"] = np.repeat([1, 2, 3, 4], 10)
    df["target_totalMinutes"] = rng.integers(0, 90, 40)
    return df


def test_regressor_features_exclude_targets_and_ids(dataframe):
    features = fp.select_regressor_features(dataframe)

    assert not any(column.startswith("target_") for column in features)
    assert "playerId" not in features
    assert "gameweek" not in features


def test_regressor_features_include_new_columns_but_not_excluded_ones(dataframe):
    dataframe[fp.REGRESSOR_EXCLUDED_FEATURES[0]] = 1.0

    features = fp.select_regressor_features(dataframe)

    assert "brand_new_feature" in features
    assert fp.REGRESSOR_EXCLUDED_FEATURES[0] not in features


def test_classifier_features_only_come_from_whitelist(dataframe):
    features = fp.select_classifier_features(dataframe)

    assert features
    assert set(features) <= set(fp.CLASSIFIER_FEATURES)
    assert "brand_new_feature" not in features


def test_default_and_explicit_gameweek_use_the_same_features(dataframe):
    standard = fp.prepare_model_data(dataframe)
    rolling = fp.prepare_model_data(dataframe, 4)

    assert standard[4] == rolling[4]


def test_selection_raises_when_nothing_is_usable():
    with pytest.raises(ValueError):
        fp.select_regressor_features(pd.DataFrame({"playerId": [1], "gameweek": [1]}))
    with pytest.raises(ValueError):
        fp.select_classifier_features(pd.DataFrame({"unrelated": [1]}))
