// horizon.js
//
// Looking more than one gameweek ahead. The prediction service sends each player's expected points per
// gameweek (`outlook`); this makes the total the number every other part of the page ranks and compares by.

export const HORIZONS = [1, 3, 5]

// A swap's gain over several gameweeks is a sum of several uncertain forecasts, so the smallest gain worth
// showing grows with it, but not in proportion since the errors are partly independent.
export const minGainForHorizon = (minGain, horizon) => minGain * Math.sqrt(horizon)

// Beyond the next gameweek the model is about as good as recent form plus the fixtures, so the
// "how often has a swap this size come off" figures (measured one gameweek ahead) don't apply.
export const hasMeasuredReliability = (horizon) => horizon <= 1

// The window as text, e.g. "gameweek 12" or "gameweeks 12 to 16"
export const describeWindow = (players, horizon) => {
    const outlook = players.find((player) => player.outlook)?.outlook

    if (horizon > 1 && outlook) {
        return `gameweeks ${outlook.from_gameweek} to ${outlook.to_gameweek}`
    }

    const gameweek = players[0]?.gameweek

    return gameweek ? `gameweek ${gameweek}` : null
}

// Players with `expected_points` replaced by the total over the window. The next gameweek's figure is kept as
// `next_gameweek_points`. Players without an outlook (a one-gameweek request) are left as they are.
export const forHorizon = (players, horizon) => {
    if (horizon <= 1) {
        return players
    }

    return players.map((player) => (
        player.outlook
            ? { ...player, next_gameweek_points: player.expected_points, expected_points: player.outlook.total_expected_points }
            : player
    ))
}
