const test = require("node:test")
const assert = require("node:assert/strict")

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const { buildTrainingDataset } = require("../services/trainingDatasetService")

// Stand-in for a mongoose query: supports .sort() and .lean() and resolves to rows
const query = (rows) => {
    const q = { sort: () => q, lean: async () => rows }
    return q
}

const fixture = (fplId, gameweek, homeTeam, awayTeam, homeScore = 1, awayScore = 0) => ({
    fplId, gameweek, homeTeam, awayTeam, homeScore, awayScore,
    finished: true,
    homeTeamDifficulty: 2,
    awayTeamDifficulty: 4
})

const gameweekRow = (playerId, gameweek, fixtureId, opponentTeam, wasHome, totalPoints, minutes = 90) => ({
    playerId, gameweek, fixtureId, opponentTeam, wasHome, totalPoints, minutes, starts: 1
})

const stubDatabase = ({ players, gameweeks, fixtures }) => {
    const originals = [Player.find, PlayerGameweek.find, PlayerSeason.find, Fixture.find]
    const originalLog = console.log

    Player.find = () => query(players)
    PlayerGameweek.find = () => query(gameweeks)
    PlayerSeason.find = () => query([])
    Fixture.find = () => query(fixtures)
    console.log = () => {}

    return () => {
        [Player.find, PlayerGameweek.find, PlayerSeason.find, Fixture.find] = originals
        console.log = originalLog
    }
}

const build = async (data) => {
    const restore = stubDatabase(data)
    try {
        return await buildTrainingDataset()
    } finally {
        restore()
    }
}

const player = { fplId: 1, team: 10, removed: false, elementType: 3 }

// Player 1 is on team 10 now but played for team 20 in gameweeks 1-2.
// Team 20 won 3-0 at home in GW1, team 10 lost 0-2 away in GW3.
const transferData = () => ({
    players: [player],
    fixtures: [
        fixture(101, 1, 20, 30, 3, 0),
        fixture(102, 2, 40, 20, 0, 0),
        fixture(103, 3, 50, 10, 2, 0),
        fixture(104, 4, 10, 60, 1, 0)
    ],
    gameweeks: [
        gameweekRow(1, 1, 101, 30, true, 6),
        gameweekRow(1, 2, 102, 40, false, 2),
        gameweekRow(1, 3, 103, 50, false, 1),
        gameweekRow(1, 4, 104, 60, true, 5)
    ]
})

const rowFor = (rows, gameweek) => rows.find((row) => row.gameweek === gameweek)

test("a player's first gameweek has no history to learn from", async () => {
    const rows = await build(transferData())
    const first = rowFor(rows, 1)

    assert.equal(first.features.recent.last5Gameweeks.totalPoints, 0)
    assert.equal(first.features.player.totalPoints, 0)
})

test("features only use gameweeks before the target gameweek", async () => {
    const rows = await build(transferData())

    // GW3 is built from GW1 (6 pts) and GW2 (2 pts), not from GW3 (1) or GW4 (5)
    assert.equal(rowFor(rows, 3).features.player.totalPoints, 8)
    assert.equal(rowFor(rows, 4).features.player.totalPoints, 9)
})

test("changing a gameweek's own result does not change its features", async () => {
    const baseline = await build(transferData())

    const altered = transferData()
    altered.gameweeks[2].totalPoints = 99
    const after = await build(altered)

    assert.deepEqual(rowFor(after, 3).features, rowFor(baseline, 3).features)
    assert.notDeepEqual(rowFor(after, 4).features, rowFor(baseline, 4).features)
})

test("fixture side and opponent come from the player's own gameweek row", async () => {
    const rows = await build(transferData())

    const gw1 = rowFor(rows, 1).features.fixtures
    assert.equal(gw1.fixtureId, 101)
    assert.equal(gw1.isHome, true)
    assert.equal(gw1.difficulty, 2)

    const gw3 = rowFor(rows, 3).features.fixtures
    assert.equal(gw3.isHome, false)
    assert.equal(gw3.difficulty, 4)
})

test("a transferred player's team form uses the team they played for at the time", async () => {
    const rows = await build(transferData())

    // In GW3 the player is on team 10 (their current team), who have no earlier
    // finished fixtures. Using the current team for the whole season would
    // also be correct here, so check GW3 against the team they were on in GW2.
    const gw3Team = rowFor(rows, 3).features.team
    assert.equal(gw3Team.overall.matches ?? gw3Team.overall.matchesPlayed ?? 0, 0)

    // In GW2 they are on team 20, who won 3-0 in GW1. With the current team
    // (10) that history would be empty.
    const gw2Team = rowFor(rows, 2).features.team
    const played = gw2Team.overall.matches ?? gw2Team.overall.matchesPlayed
    assert.equal(played, 1)
    assert.equal(gw2Team.overall.goalsScoredPerMatch, 3)
})

test("rows are skipped when the gameweek has no fixture data", async () => {
    const data = transferData()
    data.gameweeks[1].fixtureId = 999

    const rows = await build(data)

    assert.equal(rowFor(rows, 2), undefined)
    assert.ok(rowFor(rows, 3))
})

test("a single-fixture gameweek has one fixture and no second fixture", async () => {
    const rows = await build(transferData())
    const fixtures = rowFor(rows, 4).features.fixtures

    assert.equal(fixtures.fixturesInGameweek, 1)
    assert.equal(fixtures.secondFixtureIsHome, false)
    assert.equal(fixtures.secondFixtureDifficulty, 0)
})

test("a double gameweek records the second fixture", async () => {
    const data = transferData()
    // Team 10 also hosts team 60 in gameweek 3. The player's row (summed points) keeps the first fixture.
    data.fixtures.push({ ...fixture(105, 3, 10, 60, 2, 1), kickoffTime: "2020-01-03T12:00:00Z" })
    data.fixtures[2] = { ...data.fixtures[2], kickoffTime: "2020-01-01T12:00:00Z" }

    const rows = await build(data)
    const doubleWeek = rowFor(rows, 3).features.fixtures

    assert.equal(doubleWeek.fixtureId, 103)
    assert.equal(doubleWeek.fixturesInGameweek, 2)
    assert.equal(doubleWeek.secondFixtureIsHome, true)
    assert.equal(doubleWeek.secondFixtureDifficulty, 2)

    // Other gameweeks are unaffected
    assert.equal(rowFor(rows, 4).features.fixtures.fixturesInGameweek, 1)
})

test("a double gameweek counts only the player's own team", async () => {
    const data = transferData()
    data.fixtures.push(fixture(106, 3, 70, 80))

    const rows = await build(data)

    assert.equal(rowFor(rows, 3).features.fixtures.fixturesInGameweek, 1)
})
