import numpy as np
import pandas as pd

from services.predictor import generate_oof_appearance_probabilities

FEATURES = ["a", "b"]


def make_training_data(seed=0):
    rng = np.random.default_rng(seed)
    rows = 120
    df = pd.DataFrame({
        "gameweek": np.repeat([1, 2, 3, 4], rows // 4),
        "a": rng.random(rows),
        "b": rng.random(rows),
    })
    df["target_totalMinutes"] = np.where(df["a"] + rng.random(rows) * 0.3 > 0.5, 90, 0)
    return df


def test_first_gameweek_has_no_probabilities():
    probabilities = generate_oof_appearance_probabilities(make_training_data(), FEATURES)

    first = make_training_data()["gameweek"] == 1
    assert probabilities[first].isna().all()
    assert probabilities[~first].notna().all()


def test_probabilities_ignore_the_current_and_later_gameweeks():
    original = make_training_data()
    baseline = generate_oof_appearance_probabilities(original, FEATURES)

    # Flip the features and targets of gameweeks 3 and 4. Gameweek 2 is
    # predicted from gameweek 1 alone, so its probabilities must not move.
    altered = original.copy()
    later = altered["gameweek"] >= 3
    altered.loc[later, "target_totalMinutes"] = 90 - altered.loc[later, "target_totalMinutes"]
    altered.loc[later, "a"] = 1 - altered.loc[later, "a"]
    after = generate_oof_appearance_probabilities(altered, FEATURES)

    through_gw2 = original["gameweek"] <= 2
    # allclose, not equals: multi-threaded forests differ in the last bit
    assert np.allclose(baseline[through_gw2], after[through_gw2], equal_nan=True)

    # Gameweek 3 is predicted from gameweeks 1-2, so changing only gameweek 4's
    # targets must leave it unchanged too.
    gw4_targets_flipped = original.copy()
    gw4 = gw4_targets_flipped["gameweek"] == 4
    gw4_targets_flipped.loc[gw4, "target_totalMinutes"] = 90 - gw4_targets_flipped.loc[gw4, "target_totalMinutes"]
    again = generate_oof_appearance_probabilities(gw4_targets_flipped, FEATURES)
    gw3 = original["gameweek"] == 3
    assert np.allclose(baseline[gw3], again[gw3])


def test_gameweek_skipped_when_earlier_rows_have_one_class():
    df = make_training_data()
    df["target_totalMinutes"] = 90

    probabilities = generate_oof_appearance_probabilities(df, FEATURES)

    assert probabilities.isna().all()
