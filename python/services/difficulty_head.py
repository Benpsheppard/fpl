# difficulty_head.py
#
# A random forest barely responds to fixture difficulty: it is one column among
# dozens, and the effect (about -0.4 points per difficulty step) is small beside
# the noise. Measured on real data the forest moved by about -0.07 per step.
#
# This wraps the forest with a small correction, scaled by the chance of playing
# (a harder fixture only costs points if the player is on the pitch):
#
#   points = forest(X) + P(play) * (level + slope * (difficulty - mean difficulty))
#
# level and slope are fitted to the forest's out-of-sample errors: each gameweek
# is predicted by a forest that has only seen earlier gameweeks, so the numbers
# are never learned from answers the forest had already seen.

import numpy as np

from services.feature_processor import PROBABILITY_COLUMN
from services.predictor import train_random_forest_model

DIFFICULTY_COLUMN = "fixtures_difficulty"
MIN_EARLIER_ROWS = 50


class ForestWithDifficultyHead:
    def __init__(self, forest, level, slope, mean_difficulty):
        self.forest = forest
        self.level = level
        self.slope = slope
        self.mean_difficulty = mean_difficulty

    def predict(self, X):
        chance = X[PROBABILITY_COLUMN].to_numpy(float)
        difficulty = X[DIFFICULTY_COLUMN].to_numpy(float)
        return self.forest.predict(X) + chance * (self.level + self.slope * (difficulty - self.mean_difficulty))


def fit_difficulty_head(forest, X, y, gameweeks, train=train_random_forest_model):
    mean_difficulty = float(X[DIFFICULTY_COLUMN].mean())
    gameweeks = np.asarray(gameweeks)
    actual = np.asarray(y, dtype=float)

    residuals, rows = [], []
    for gameweek in sorted(set(gameweeks))[1:]:
        earlier = gameweeks < gameweek
        now = gameweeks == gameweek
        if earlier.sum() < MIN_EARLIER_ROWS:
            continue
        out_of_sample = train(X[earlier], y[earlier]).predict(X[now])
        residuals.append(actual[now] - out_of_sample)
        rows.append(X[now])

    if not rows:
        return ForestWithDifficultyHead(forest, 0.0, 0.0, mean_difficulty)

    errors = np.concatenate(residuals)
    held_out = np.concatenate([r[[PROBABILITY_COLUMN, DIFFICULTY_COLUMN]].to_numpy(float) for r in rows])
    chance = held_out[:, 0]
    design = np.column_stack([chance, chance * (held_out[:, 1] - mean_difficulty)])
    (level, slope), *_ = np.linalg.lstsq(design, errors, rcond=None)

    return ForestWithDifficultyHead(forest, float(level), float(slope), mean_difficulty)


def train_regressor_with_difficulty_head(X, y, gameweeks=None):
    forest = train_random_forest_model(X, y)
    if gameweeks is None:
        return ForestWithDifficultyHead(forest, 0.0, 0.0, float(X[DIFFICULTY_COLUMN].mean()))
    return fit_difficulty_head(forest, X, y, gameweeks)
