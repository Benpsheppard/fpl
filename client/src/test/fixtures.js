// Shapes copied from the real services: Python /predict rows and Node /api/my-team.

export const prediction = (overrides = {}) => ({
    playerId: 1,
    name: "Player",
    fullName: "First Player",
    team: 1,
    position: 3,
    price: 6.0,
    gameweek: 10,
    expected_points: 4.0,
    predicted_points: 4.0,
    model_points: 4.0,
    appearance_probability: 0.95,
    adjusted_appearance_probability: 0.95,
    fixtures_in_gameweek: 1,
    news: "",
    adjustments: {
        double_gameweek: { fixtures: 1, scaled_by_fixture_count: false, model_training_rows: 0 },
        availability: { status: "a", chance: 1, basis: "next_round", source: "reported" },
    },
    ...overrides,
})

// Set a player's availability the way /predict reports it
export const withAvailability = (status, chance, overrides = {}) => prediction({
    adjustments: {
        double_gameweek: { fixtures: 1, scaled_by_fixture_count: false, model_training_rows: 0 },
        availability: { status, chance, basis: "next_round", source: "reported" },
    },
    ...overrides,
})

export const ownedPlayer = (overrides = {}) => ({
    playerId: 1,
    position: 1, // the squad slot, 1-15
    isCaptain: false,
    isViceCaptain: false,
    webName: "Player",
    team: 1,
    elementType: 3,
    status: "a",
    news: "",
    nowPrice: 6.0,
    purchasePrice: 6.0,
    sellPrice: 6.0,
    ...overrides,
})

export const myTeam = (squad, overrides = {}) => ({
    teamName: "My Team",
    currentGameweek: 9,
    basedOnGameweek: 9,
    activeChip: null,
    pendingTransfers: { applied: 0, ignored: 0 },
    bank: 1.2,
    squadValue: 99.3,
    squad,
    ...overrides,
})
