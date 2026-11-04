// fixtures.js
//
// A player's next few gameweeks of fixtures, coloured by FPL's difficulty rating (1 easiest, 5 hardest).

// FPL's five ratings, easiest to hardest. Each gets its own colour: deep green, green, grey, red, deep red.
export const DIFFICULTY_SCALE = [
    { rating: 1, level: "easiest", label: "Easiest" },
    { rating: 2, level: "easy", label: "Easy" },
    { rating: 3, level: "neutral", label: "Neutral" },
    { rating: 4, level: "hard", label: "Hard" },
    { rating: 5, level: "hardest", label: "Hardest" },
]

export const DIFFICULTY_LABELS = {
    ...Object.fromEntries(DIFFICULTY_SCALE.map(({ level, label }) => [level, label])),
    unknown: "Unknown",
}

// A rating outside 1-5, or not a whole number, is not coloured rather than guessed at
export const difficultyLevel = (difficulty) => (
    DIFFICULTY_SCALE.find(({ rating }) => rating === difficulty)?.level ?? "unknown"
)

// One cell per gameweek in the window. A blank gameweek is an empty cell and a double gameweek has two
// fixtures, so a run of fixtures lines up with the same gameweek for every player.
export const fixtureCells = (run) => {
    if (!run || !Number.isInteger(run.from_gameweek) || !Number.isInteger(run.to_gameweek)) {
        return []
    }

    const cells = []

    for (let gameweek = run.from_gameweek; gameweek <= run.to_gameweek; gameweek++) {
        cells.push({
            gameweek,
            fixtures: (run.fixtures ?? []).filter((fixture) => fixture.gameweek === gameweek),
        })
    }

    return cells
}

// Words for screen readers and tooltips: the colour alone shouldn't carry the meaning
export const describeFixture = (fixture, clubs) => {
    const club = clubs.get(fixture.opponent)
    const level = difficultyLevel(fixture.difficulty)
    const rating = level === "unknown" ? "" : `, ${DIFFICULTY_LABELS[level].toLowerCase()} (${fixture.difficulty} out of 5)`

    return `Gameweek ${fixture.gameweek}: ${fixture.is_home ? "home to" : "away at"} ${club?.name ?? `team ${fixture.opponent}`}${rating}${fixture.played ? ", already played" : ""}`
}
