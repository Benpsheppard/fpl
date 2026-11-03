const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const { getPredictionFeatures } = require("../services/predictionFeatureService")
const { buildTrainingDataset } = require("../services/trainingDatasetService")

const query = (rows) => {
    const q = { sort: () => q, lean: async () => rows }
    return q
}

const future = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

const player = { fplId: 1, firstName: "Bukayo", secondName: "Saka", webName: "Saka", team: 10, removed: false, elementType: 3, status: "a", chanceOfPlayingThisRound: 100, chanceOfPlayingNextRound: 100 }

const finished = (fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore) => ({
    fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore,
    finished: true, kickoffTime: "2020-01-01T12:00:00Z",
    homeTeamDifficulty: 2, awayTeamDifficulty: 4
})

const upcoming = (fplId, gameweek, homeTeam, awayTeam, days) => ({
    fplId, gameweek, homeTeam, awayTeam,
    finished: false, kickoffTime: future(days),
    homeTeamDifficulty: 3, awayTeamDifficulty: 5
})

const played = (gameweek, fixtureId, opponentTeam, wasHome, totalPoints) => ({
    playerId: 1, gameweek, fixtureId, opponentTeam, wasHome, totalPoints, minutes: 90, starts: 1
})

const data = () => ({
    fixtures: [
        finished(101, 1, 10, 20, 2, 0),
        finished(102, 2, 30, 10, 1, 1),
        finished(103, 3, 10, 40, 0, 1),
        upcoming(104, 4, 50, 10, 3),
        upcoming(105, 5, 10, 60, 10)
    ],
    gameweeks: [
        played(1, 101, 20, true, 6),
        played(2, 102, 30, false, 2),
        played(3, 103, 40, true, 1)
    ]
})

const withStubs = async (rows, fn) => {
    const originals = {
        playerFindOne: Player.findOne, playerFind: Player.find,
        gwFind: PlayerGameweek.find, seasonFind: PlayerSeason.find, fixtureFind: Fixture.find,
        log: console.log
    }

    Player.findOne = () => query(player)
    Player.find = () => query([player])
    PlayerGameweek.find = () => query(rows.gameweeks)
    PlayerSeason.find = () => query([])
    Fixture.find = () => query(rows.fixtures)
    console.log = () => {}

    try {
        return await fn()
    } finally {
        Player.findOne = originals.playerFindOne
        Player.find = originals.playerFind
        PlayerGameweek.find = originals.gwFind
        PlayerSeason.find = originals.seasonFind
        Fixture.find = originals.fixtureFind
        console.log = originals.log
    }
}

// Every key path in an object, ignoring values
const keyPaths = (value, prefix = "") => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [prefix]
    }

    return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
}

test("prediction targets the next upcoming fixture", async () => {
    const result = await withStubs(data(), () => getPredictionFeatures(1))

    assert.equal(result.gameweek, 4)
    assert.equal(result.features.fixtures.fixtureId, 104)
    assert.equal(result.features.fixtures.isHome, false)
    assert.equal(result.features.fixtures.difficulty, 5)
})

test("prediction features have the same schema as a training row", async () => {
    const rows = data()
    const prediction = await withStubs(rows, () => getPredictionFeatures(1))

    // Training row for the last played gameweek, from the same stubbed data
    const dataset = await withStubs(rows, () => buildTrainingDataset())
    const trainingRow = dataset.find((row) => row.gameweek === 3)

    assert.deepEqual(
        keyPaths(prediction.features).sort(),
        keyPaths(trainingRow.features).sort()
    )
})

test("prediction history is the same as a training row's would be", async () => {
    const rows = data()
    const prediction = await withStubs(rows, () => getPredictionFeatures(1))

    // Pretend the next fixture has been played: its training row sees GW1-3
    rows.gameweeks.push(played(4, 104, 50, false, 0))
    rows.fixtures[3].finished = true
    const dataset = await withStubs(rows, () => buildTrainingDataset())
    const trainingRow = dataset.find((row) => row.gameweek === 4)

    for (const section of ["recent", "availability", "historical", "player"]) {
        assert.deepEqual(prediction.features[section], trainingRow.features[section], section)
    }
})

test("live status information is kept out of the model features", async () => {
    const result = await withStubs(data(), () => getPredictionFeatures(1))

    assert.deepEqual(result.context.player, { firstName: "Bukayo", secondName: "Saka", webName: "Saka" })
    assert.equal(result.context.status, "a")
    assert.ok(result.context.fixtureLookahead)
    assert.equal(JSON.stringify(result.features).includes("chanceOfPlaying"), false)
})

test("no prediction without an upcoming fixture or history", async () => {
    const noFixture = data()
    noFixture.fixtures = noFixture.fixtures.slice(0, 3)
    assert.equal(await withStubs(noFixture, () => getPredictionFeatures(1)), null)

    const noHistory = data()
    noHistory.gameweeks = []
    assert.equal(await withStubs(noHistory, () => getPredictionFeatures(1)), null)
})

// The Python service flattens this exact payload. The fixture is checked in
// there, so any change to the feature schema must update it (and Python) too.
// Regenerate with: UPDATE_CONTRACT_FIXTURE=1 npm test
const FIXTURE_PATH = path.join(__dirname, "..", "..", "python", "tests", "fixtures", "prediction_payload.json")

test("prediction payload matches the fixture the Python tests use", async () => {
    const prediction = await withStubs(data(), () => getPredictionFeatures(1))
    // Dates and live status vary between runs and are not part of the model schema
    const { context, ...payload } = prediction

    if (process.env.UPDATE_CONTRACT_FIXTURE) {
        fs.writeFileSync(FIXTURE_PATH, JSON.stringify(payload, null, 2) + "\n")
    }

    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"))

    assert.deepEqual(keyPaths(payload).sort(), keyPaths(fixture).sort())
})
