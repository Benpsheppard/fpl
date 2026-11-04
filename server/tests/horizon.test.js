const test = require("node:test")
const assert = require("node:assert/strict")

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const trainingDatasetService = require("../services/trainingDatasetService")
const { buildFeatureSet } = require("../services/featureBuilder")
const { getCachedDataset, invalidateDatasetCache } = require("../services/datasetCache")
const { createApp } = require("../app")

const { buildTrainingDataset } = trainingDatasetService

// --- team form "as of" a gameweek ---------------------------------------------

const finishedFixture = (fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore) => ({
    fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore, finished: true,
    homeTeamDifficulty: 2, awayTeamDifficulty: 4
})

const featuresAt = (asOfGameweek) => buildFeatureSet({
    player: { fplId: 1, team: 10, elementType: 3 },
    teamId: 10,
    opponentTeamId: 20,
    isHome: true,
    // The match being predicted is in gameweek 6...
    fixture: { fplId: 99, gameweek: 6, homeTeam: 10, awayTeam: 20, finished: false, homeTeamDifficulty: 3, awayTeamDifficulty: 3 },
    previousGameweeks: [],
    seasons: [],
    // ...and team 10 has played in gameweeks 1 to 4
    fixtures: [1, 2, 3, 4].map((gameweek) => finishedFixture(gameweek, gameweek, 10, 30 + gameweek, 2, 0)),
    fixtureById: new Map(),
    asOfGameweek
})

test("team form counts every finished match before the fixture's own gameweek by default", () => {
    assert.equal(featuresAt(undefined).team.overall.matches, 4)
})

test("team form can be as of an earlier gameweek, as it would be for a forecast made earlier", () => {
    assert.equal(featuresAt(3).team.overall.matches, 2) // only gameweeks 1 and 2 had finished
    assert.equal(featuresAt(5).team.overall.matches, 4)
})

test("the fixture itself is unaffected by when the forecast is made", () => {
    const early = featuresAt(2)
    const late = featuresAt(6)

    assert.deepEqual(early.fixtures, late.fixtures)
    assert.equal(early.fixtures.gameweek, 6)
})

// --- dataset rows at a longer horizon -----------------------------------------

const query = (rows) => {
    const q = { sort: () => q, lean: async () => rows }
    return q
}

const fixture = (fplId, gameweek, homeTeam, awayTeam, homeScore = 1, awayScore = 0) => ({
    fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore, finished: true,
    homeTeamDifficulty: 2, awayTeamDifficulty: 4
})

const row = (gameweek, fixtureId, opponentTeam, wasHome, totalPoints) => ({
    playerId: 1, gameweek, fixtureId, opponentTeam, wasHome, totalPoints, minutes: 90, starts: 1
})

// One player, always on team 10, with a different number of points each gameweek
const data = () => ({
    players: [{ fplId: 1, team: 10, removed: false, elementType: 3 }],
    fixtures: [
        fixture(101, 1, 10, 20), fixture(102, 2, 30, 10), fixture(103, 3, 10, 40),
        fixture(104, 4, 50, 10), fixture(105, 5, 10, 60)
    ],
    gameweeks: [
        row(1, 101, 20, true, 1), row(2, 102, 30, false, 2), row(3, 103, 40, true, 4),
        row(4, 104, 50, false, 8), row(5, 105, 60, true, 16)
    ]
})

const build = async (options) => {
    const originals = [Player.find, PlayerGameweek.find, PlayerSeason.find, Fixture.find, console.log]
    const rows = data()
    Player.find = () => query(rows.players)
    PlayerGameweek.find = () => query(rows.gameweeks)
    PlayerSeason.find = () => query([])
    Fixture.find = () => query(rows.fixtures)
    console.log = () => {}

    try {
        return await buildTrainingDataset(options)
    } finally {
        [Player.find, PlayerGameweek.find, PlayerSeason.find, Fixture.find, console.log] = originals
    }
}

const forGameweek = (dataset, gameweek) => dataset.find((r) => r.gameweek === gameweek)

test("horizon 1 is the usual dataset", async () => {
    assert.deepEqual(await build({ horizon: 1 }), await build())
    assert.deepEqual(await build({}), await build())
})

test("every row at horizon 1 is built from all the gameweeks before it", async () => {
    const dataset = await build({ horizon: 1 })

    // Gameweek 4 sees gameweeks 1 to 3: 1 + 2 + 4 points
    assert.equal(forGameweek(dataset, 4).features.player.totalPoints, 7)
})

test("a longer horizon builds each row from older gameweeks, as a forecast made earlier would have", async () => {
    const two = await build({ horizon: 2 })
    const three = await build({ horizon: 3 })

    // For gameweek 4: a forecast two ahead sees gameweeks up to 2 (1 + 2), and three ahead up to 1 (1)
    assert.equal(forGameweek(two, 4).features.player.totalPoints, 3)
    assert.equal(forGameweek(three, 4).features.player.totalPoints, 1)
})

test("the target is still the points scored in that gameweek, whatever the horizon", async () => {
    for (const horizon of [1, 2, 3]) {
        const dataset = await build({ horizon })

        assert.equal(forGameweek(dataset, 4).target.totalPoints, 8)
    }
})

test("the fixture is the later one, so venue and difficulty are the same at every horizon", async () => {
    const one = forGameweek(await build({ horizon: 1 }), 4).features.fixtures
    const three = forGameweek(await build({ horizon: 3 }), 4).features.fixtures

    assert.deepEqual(three, one)
    assert.equal(three.gameweek, 4)
    assert.equal(three.isHome, false)
})

test("team form is as old as the forecast", async () => {
    const one = forGameweek(await build({ horizon: 1 }), 5).features.team.overall.matches
    const three = forGameweek(await build({ horizon: 3 }), 5).features.team.overall.matches

    // At horizon 1 the four earlier matches have been played; at horizon 3 only gameweeks 1 to 2 had been
    assert.equal(one, 4)
    assert.equal(three, 2)
})

test("a forecast can't be made before the season started, so those rows are left out", async () => {
    assert.deepEqual((await build({ horizon: 1 })).map((r) => r.gameweek), [1, 2, 3, 4, 5])
    assert.deepEqual((await build({ horizon: 3 })).map((r) => r.gameweek), [3, 4, 5])
})

test("a row's features never use a gameweek at or after the one the forecast is made before", async () => {
    // Change the points of gameweek 3, then look at forecasts made before gameweek 3 for later targets
    const original = await build({ horizon: 3 })
    const originals = data()
    originals.gameweeks[2].totalPoints = 999

    const Pg = PlayerGameweek.find
    PlayerGameweek.find = () => query(originals.gameweeks)
    Player.find = () => query(originals.players)
    PlayerSeason.find = () => query([])
    Fixture.find = () => query(originals.fixtures)
    const log = console.log
    console.log = () => {}
    let changed
    try {
        changed = await buildTrainingDataset({ horizon: 3 })
    } finally {
        PlayerGameweek.find = Pg
        console.log = log
    }

    // Gameweek 5 at horizon 3 is a forecast made before gameweek 3, so gameweek 3's points can't reach it
    assert.deepEqual(forGameweek(changed, 5).features, forGameweek(original, 5).features)
})

// --- the cache keeps each horizon separately ----------------------------------

test("each key is built and cached on its own", async () => {
    invalidateDatasetCache()
    const built = []
    const buildFor = (name) => async () => { built.push(name); return [name] }

    assert.deepEqual(await getCachedDataset(buildFor("one"), "horizon-1"), ["one"])
    assert.deepEqual(await getCachedDataset(buildFor("three"), "horizon-3"), ["three"])
    assert.deepEqual(await getCachedDataset(buildFor("again"), "horizon-1"), ["one"]) // cached
    assert.deepEqual(built, ["one", "three"])
})

test("a sync clears every cached horizon", async () => {
    invalidateDatasetCache()
    await getCachedDataset(async () => ["old-1"], "horizon-1")
    await getCachedDataset(async () => ["old-3"], "horizon-3")

    invalidateDatasetCache()

    assert.deepEqual(await getCachedDataset(async () => ["new-1"], "horizon-1"), ["new-1"])
    assert.deepEqual(await getCachedDataset(async () => ["new-3"], "horizon-3"), ["new-3"])
})

test("simultaneous requests for one horizon share a build, and different horizons don't wait on each other", async () => {
    invalidateDatasetCache()
    let builds = 0
    let release
    const slow = () => new Promise((resolve) => { builds++; release = () => resolve(["slow"]) })

    const first = getCachedDataset(slow, "horizon-2")
    const second = getCachedDataset(slow, "horizon-2")
    const other = await getCachedDataset(async () => ["quick"], "horizon-4")

    assert.deepEqual(other, ["quick"])
    release()
    assert.deepEqual(await first, ["slow"])
    assert.strictEqual(await first, await second)
    assert.equal(builds, 1)
})

test("a key used without a name still works, as before", async () => {
    invalidateDatasetCache()

    assert.deepEqual(await getCachedDataset(async () => ["x"]), ["x"])
    assert.deepEqual(await getCachedDataset(async () => ["y"]), ["x"])
})

// --- the endpoint --------------------------------------------------------------

const withServer = async (fn) => {
    const server = createApp().listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`)
    } finally {
        await new Promise((resolve) => server.close(resolve))
    }
}

const withDatasetService = async (replacement, fn) => {
    const original = trainingDatasetService.getTrainingDataset
    trainingDatasetService.getTrainingDataset = replacement
    try {
        return await fn()
    } finally {
        trainingDatasetService.getTrainingDataset = original
    }
}

test("the dataset endpoint passes the horizon through, and defaults to 1", () => withServer(async (base) => {
    const seen = []
    await withDatasetService(async (options) => { seen.push(options); return [] }, async () => {
        await fetch(`${base}/api/training/dataset`)
        await fetch(`${base}/api/training/dataset?horizon=3`)
        await fetch(`${base}/api/training/dataset?horizon=2&maxGameweek=6`)
    })

    assert.deepEqual(seen, [
        { maxGameweek: undefined, horizon: 1 },
        { maxGameweek: undefined, horizon: 3 },
        { maxGameweek: 6, horizon: 2 }
    ])
}))

for (const bad of ["0", "6", "-1", "1.5", "abc", ""]) {
    test(`the dataset endpoint rejects horizon=${JSON.stringify(bad)}`, () => withServer(async (base) => {
        await withDatasetService(async () => { throw new Error("must not be called") }, async () => {
            const response = await fetch(`${base}/api/training/dataset?horizon=${bad}`)

            assert.equal(response.status, 400)
            assert.match((await response.json()).message, /horizon/)
        })
    }))
}

// --- the prediction endpoint ---------------------------------------------------

const predictionService = require("../services/predictionFeatureService")

const withPredictionService = async (replacement, fn) => {
    const original = predictionService.getAllPredictionFeatures
    predictionService.getAllPredictionFeatures = replacement
    try {
        return await fn()
    } finally {
        predictionService.getAllPredictionFeatures = original
    }
}

test("the prediction endpoint passes the horizon through, and defaults to 1", () => withServer(async (base) => {
    const seen = []
    await withPredictionService(async (options) => { seen.push(options); return { players: [] } }, async () => {
        await fetch(`${base}/api/prediction/all`)
        await fetch(`${base}/api/prediction/all?horizon=5`)
    })

    assert.deepEqual(seen, [{ horizon: 1 }, { horizon: 5 }])
}))

for (const bad of ["0", "6", "2.5", "abc", ""]) {
    test(`the prediction endpoint rejects horizon=${JSON.stringify(bad)}`, () => withServer(async (base) => {
        await withPredictionService(async () => { throw new Error("must not be called") }, async () => {
            const response = await fetch(`${base}/api/prediction/all?horizon=${bad}`)

            assert.equal(response.status, 400)
        })
    }))
}
