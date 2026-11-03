const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const { getPredictionFeatures, getAllPredictionFeatures } = require("../services/predictionFeatureService")
const { buildTrainingDataset } = require("../services/trainingDatasetService")

const query = (rows) => {
    const q = { sort: () => q, select: () => q, lean: async () => rows }
    return q
}

const future = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

const player = { fplId: 1, firstName: "Bukayo", secondName: "Saka", webName: "Saka", nowCost: 105, team: 10, removed: false, elementType: 3, status: "a", chanceOfPlayingThisRound: 100, chanceOfPlayingNextRound: 100 }

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
        gwFind: PlayerGameweek.find, gwFindOne: PlayerGameweek.findOne, seasonFind: PlayerSeason.find, fixtureFind: Fixture.find,
        log: console.log
    }

    Player.findOne = () => query(player)
    Player.find = () => query(rows.players || [player])
    PlayerGameweek.find = () => query(rows.gameweeks)
    // The league-wide latest gameweek row, used to tell whether the data is stale
    PlayerGameweek.findOne = () => query(rows.latestRow !== undefined ? rows.latestRow : rows.gameweeks.at(-1))
    PlayerSeason.find = () => query([])
    Fixture.find = () => query(rows.fixtures)
    console.log = () => {}

    try {
        return await fn()
    } finally {
        Player.findOne = originals.playerFindOne
        Player.find = originals.playerFind
        PlayerGameweek.find = originals.gwFind
        PlayerGameweek.findOne = originals.gwFindOne
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

    // Price is stored in tenths of a million
    assert.deepEqual(result.context.player, { firstName: "Bukayo", secondName: "Saka", webName: "Saka", team: 10, elementType: 3, price: 10.5 })
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

test("a double gameweek is described by the next fixture plus the second", async () => {
    const rows = data()
    rows.fixtures.push(upcoming(106, 4, 10, 70, 5))

    const result = await withStubs(rows, () => getPredictionFeatures(1))

    assert.equal(result.features.fixtures.fixtureId, 104)
    assert.equal(result.features.fixtures.fixturesInGameweek, 2)
    assert.equal(result.features.fixtures.secondFixtureIsHome, true)
    assert.equal(result.features.fixtures.secondFixtureDifficulty, 3)
})

test("a normal gameweek has one fixture", async () => {
    const result = await withStubs(data(), () => getPredictionFeatures(1))

    assert.equal(result.features.fixtures.fixturesInGameweek, 1)
    assert.equal(result.features.fixtures.secondFixtureDifficulty, 0)
})

// Availability: FPL's chance-of-playing news only covers the coming round
const withPlayer = async (overrides, rows, fn) => {
    const original = { ...player }
    Object.assign(player, overrides)
    try {
        return await withStubs(rows, fn)
    } finally {
        for (const key of Object.keys(overrides)) {
            delete player[key]
        }
        Object.assign(player, original)
    }
}

const availabilityFor = async (overrides, rows = data()) => {
    const result = await withPlayer(overrides, rows, () => getPredictionFeatures(1))
    return result.context.availability
}

test("before the gameweek starts, the next-round chance applies", async () => {
    const availability = await availabilityFor({ status: "d", chanceOfPlayingNextRound: 50, chanceOfPlayingThisRound: 0 })

    assert.deepEqual(availability, { status: "d", chance: 0.5, basis: "next_round", source: "reported" })
})

test("once the gameweek is under way, the this-round chance applies", async () => {
    const rows = data()
    rows.fixtures.push(finished(107, 4, 80, 90, 1, 0)) // another match in gameweek 4 has been played

    const availability = await availabilityFor({ status: "d", chanceOfPlayingNextRound: 100, chanceOfPlayingThisRound: 25 }, rows)

    assert.deepEqual(availability, { status: "d", chance: 0.25, basis: "this_round", source: "reported" })
})

test("a reported chance of 0 is kept, not treated as missing", async () => {
    const availability = await availabilityFor({ status: "i", chanceOfPlayingNextRound: 0 })

    assert.equal(availability.chance, 0)
    assert.equal(availability.source, "reported")
})

test("with no percentage, status decides: available is 1, injured or suspended is 0", async () => {
    assert.equal((await availabilityFor({ status: "a", chanceOfPlayingNextRound: null })).chance, 1)
    assert.equal((await availabilityFor({ status: "i", chanceOfPlayingNextRound: null })).chance, 0)
    assert.equal((await availabilityFor({ status: "s", chanceOfPlayingNextRound: null })).chance, 0)
    assert.equal((await availabilityFor({ status: "u", chanceOfPlayingNextRound: null })).chance, 0)
})

test("a doubtful player with no percentage is unknown rather than guessed", async () => {
    const availability = await availabilityFor({ status: "d", chanceOfPlayingNextRound: null })

    assert.equal(availability.chance, null)
})

test("news does not apply to a gameweek beyond the coming round", async () => {
    const rows = data()
    // Everyone else still has a gameweek 4 match to play, but this team's next game is gameweek 5
    rows.fixtures = rows.fixtures.filter((fixture) => fixture.fplId !== 104)
    rows.fixtures.push(upcoming(108, 4, 80, 90, 2))

    const availability = await availabilityFor({ status: "i", chanceOfPlayingNextRound: 0 }, rows)

    assert.equal(availability.chance, null)
    assert.equal(availability.basis, "none")
})


test("the payload says where the data stops", async () => {
    const result = await withStubs(data(), () => getPredictionFeatures(1))

    // Gameweek 3 is the last row; gameweek 3 fixtures are the latest finished
    assert.deepEqual(result.context.freshness, { dataThroughGameweek: 3, latestFinishedFixtureGameweek: 3 })
})

test("results that outrun the stored player data are visible", async () => {
    const rows = data()
    rows.fixtures.push(finished(109, 4, 80, 90, 1, 0)) // a gameweek 4 match has been played, but no player rows exist for it

    const result = await withStubs(rows, () => getPredictionFeatures(1))

    assert.deepEqual(result.context.freshness, { dataThroughGameweek: 3, latestFinishedFixtureGameweek: 4 })
})

test("freshness is league-wide, so a blank gameweek is not mistaken for stale data", async () => {
    const rows = data()
    // Another player has gameweek 3 data; this player's own last row is earlier
    rows.gameweeks = rows.gameweeks.slice(0, 2)
    rows.latestRow = { gameweek: 3 }

    const result = await withStubs(rows, () => getPredictionFeatures(1))

    assert.equal(result.context.freshness.dataThroughGameweek, 3)
})

// All players at once
const withManyPlayers = withStubs

const second = { fplId: 2, firstName: "Gabriel", secondName: "Jesus", webName: "Jesus", nowCost: 65, team: 50, removed: false, elementType: 4, status: "a" }

const manyPlayers = () => {
    const rows = data()
    rows.players = [ player, second ]
    rows.gameweeks = [
        ...rows.gameweeks,
        { ...played(1, 101, 20, true, 3), playerId: 2 },
        { ...played(2, 102, 30, false, 5), playerId: 2 }
    ]
    return rows
}

test("all-players payloads are identical to the single-player ones", async () => {
    const rows = manyPlayers()

    const all = await withManyPlayers(rows, () => getAllPredictionFeatures())

    // The single-player path asks for one player's rows
    for (const target of rows.players) {
        const single = await withStubs({
            ...rows,
            gameweeks: rows.gameweeks.filter((row) => row.playerId === target.fplId),
            latestRow: { gameweek: 3 }
        }, async () => {
            const original = Player.findOne
            Player.findOne = () => query(target)
            try {
                return await getPredictionFeatures(target.fplId)
            } finally {
                Player.findOne = original
            }
        })

        const fromAll = all.players.find((payload) => payload.playerId === target.fplId)
        // The two paths build "now" separately; compare everything that matters
        delete fromAll.context.fixtureLookahead
        delete single.context.fixtureLookahead
        assert.deepEqual(fromAll, single, `player ${target.fplId}`)
    }
})

test("all-players returns a count, shared freshness, and skips players it cannot predict", async () => {
    const rows = manyPlayers()
    rows.players.push({ fplId: 3, webName: "NoHistory", team: 60, removed: false, elementType: 2 })

    const all = await withManyPlayers(rows, () => getAllPredictionFeatures())

    assert.equal(all.count, 2)
    assert.deepEqual(all.players.map((payload) => payload.playerId).sort(), [ 1, 2 ])
    assert.deepEqual(all.freshness, { dataThroughGameweek: 3, latestFinishedFixtureGameweek: 3 })
})

test("all-players handles an empty database", async () => {
    const rows = { fixtures: [], gameweeks: [], players: [] }

    const all = await withManyPlayers(rows, () => getAllPredictionFeatures())

    assert.deepEqual(all, { freshness: { dataThroughGameweek: null, latestFinishedFixtureGameweek: null }, count: 0, players: [] })
})
