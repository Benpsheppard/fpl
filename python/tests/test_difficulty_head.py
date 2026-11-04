import numpy as np
import pandas as pd

from services.difficulty_head import (
    DIFFICULTY_COLUMN,
    fit_difficulty_head,
    train_regressor_with_difficulty_head,
)
from services.feature_processor import PROBABILITY_COLUMN

GAMEWEEKS = 6
PER_GAMEWEEK = 80
TRUE_SLOPE = -0.5


def make_data(seed=0, chance=1.0, slope=TRUE_SLOPE):
    rng = np.random.default_rng(seed)
    rows = GAMEWEEKS * PER_GAMEWEEK
    X = pd.DataFrame({
        "noise": rng.random(rows),
        DIFFICULTY_COLUMN: rng.integers(1, 6, rows).astype(float),
        PROBABILITY_COLUMN: np.full(rows, chance),
    })
    y = pd.Series(3 + slope * (X[DIFFICULTY_COLUMN] - 3) * chance + rng.normal(0, 0.3, rows))
    gameweeks = pd.Series(np.repeat(np.arange(1, GAMEWEEKS + 1), PER_GAMEWEEK))
    return X, y, gameweeks


def difficulty_effect(model, chance):
    rows = pd.DataFrame({"noise": 0.5, DIFFICULTY_COLUMN: [2.0, 4.0], PROBABILITY_COLUMN: chance})
    easy, hard = model.predict(rows)
    return (hard - easy) / 2


class MeanOnly:
    """A learner that ignores every feature, standing in for a forest that cannot see the effect."""
    def __init__(self, mean):
        self.mean = mean

    def predict(self, X):
        return np.full(len(X), self.mean)


def mean_only(X, y):
    return MeanOnly(float(np.mean(y)))


def fitted(X, y, gameweeks):
    return fit_difficulty_head(mean_only(X, y), X, y, gameweeks, train=mean_only)


def test_it_recovers_a_difficulty_effect_the_forest_missed():
    X, y, gameweeks = make_data()

    model = fitted(X, y, gameweeks)

    assert abs(model.slope - TRUE_SLOPE) < 0.1
    assert abs(difficulty_effect(model, 1.0) - TRUE_SLOPE) < 0.1


def test_the_effect_scales_with_the_chance_of_playing():
    X, y, gameweeks = make_data()
    model = fitted(X, y, gameweeks)

    assert abs(difficulty_effect(model, 0.5) - TRUE_SLOPE / 2) < 0.1
    assert difficulty_effect(model, 0.0) == 0.0


def test_it_finds_nothing_when_difficulty_does_not_matter():
    X, y, gameweeks = make_data(slope=0.0)

    assert abs(fitted(X, y, gameweeks).slope) < 0.1


def test_without_gameweeks_it_adds_no_correction():
    X, y, _ = make_data()

    model = train_regressor_with_difficulty_head(X, y)

    assert (model.level, model.slope) == (0.0, 0.0)
    assert np.allclose(model.predict(X), model.forest.predict(X))


def test_it_learns_a_level_shift_the_forest_gets_wrong():
    X, y, gameweeks = make_data()
    forest = MeanOnly(float(y.mean()) - 1.0)  # always one point too low

    model = fit_difficulty_head(forest, X, y + 0, gameweeks, train=lambda a, b: MeanOnly(float(np.mean(b)) - 1.0))

    assert abs(model.level - 1.0) < 0.1


def test_only_later_gameweeks_are_held_out_to_fit_the_correction():
    # Held-out errors come from forests trained on strictly earlier gameweeks
    X, y, gameweeks = make_data()
    seen = []

    def spy(a, b):
        seen.append(len(a))
        return MeanOnly(float(np.mean(b)))

    fit_difficulty_head(MeanOnly(0.0), X, y, gameweeks, train=spy)

    assert seen == [PER_GAMEWEEK * k for k in range(1, GAMEWEEKS)]


def test_the_level_shift_is_fitted_per_unit_of_chance_of_playing():
    # The forest is 1 point too low for a certain starter, so 0.5 for a player with a 50% chance
    X, y, gameweeks = make_data(slope=0.0)
    chance = np.random.default_rng(3).uniform(0.2, 1.0, len(X))
    X[PROBABILITY_COLUMN] = chance
    y = pd.Series(np.asarray(y) - 3 + 1.0 * chance)

    model = fit_difficulty_head(MeanOnly(0.0), X, y, gameweeks, train=lambda a, b: MeanOnly(0.0))

    assert abs(model.level - 1.0) < 0.1
