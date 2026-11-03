const test = require("node:test")
const assert = require("node:assert/strict")

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const fplService = require("../services/fplService")
const { syncPlayerHistory, syncPlayerSeasons, syncAllPlayersHistory } = require("../services/fplSyncService")

const stub = (target, key, replacement) => {
    const original = target[key]
    target[key] = replacement
    return () => { target[key] = original }
}

const summary = {
    history: [ { element: 1, round: 1, fixture: 1, total_points: 2, minutes: 90 } ],
    history_past: [ { season_name: "2023/24", total_points: 100 } ]
}

test("syncPlayerHistory makes one FPL request for both gameweeks and seasons", async () => {
    let requests = 0
    const writes = []
    const restores = [
        stub(fplService, "getPlayerGameweek", async () => { requests++; return summary }),
        stub(PlayerGameweek, "bulkWrite", async (ops) => { writes.push(["gameweek", ops.length]); return { matchedCount: 0, modifiedCount: 0, upsertedCount: ops.length } }),
        stub(PlayerSeason, "bulkWrite", async (ops) => { writes.push(["season", ops.length]); return { matchedCount: 0, modifiedCount: 0, upsertedCount: ops.length } })
    ]

    try {
        const result = await syncPlayerHistory(1)

        assert.equal(requests, 1)
        assert.deepEqual(writes, [ [ "gameweek", 1 ], [ "season", 1 ] ])
        assert.ok(result.playerGameweeks && result.playerSeasons)
    } finally {
        restores.forEach((restore) => restore())
    }
})

test("a player with no past seasons does not call bulkWrite with an empty list", async () => {
    let bulkWrites = 0
    const restore = stub(PlayerSeason, "bulkWrite", async () => { bulkWrites++; throw new Error("Invalid BulkOperation, Batch cannot be empty") })

    try {
        const result = await syncPlayerSeasons(1, { history: [], history_past: [] })

        assert.equal(bulkWrites, 0)
        assert.equal(result.playerSeasons.upserted, 0)
    } finally {
        restore()
    }
})

test("syncPlayerSeasons rejects missing summary data", async () => {
    const restore = stub(fplService, "getPlayerGameweek", async () => undefined)

    try {
        await assert.rejects(syncPlayerSeasons(1), /Invalid player summary/)
    } finally {
        restore()
    }
})

test("a second all-players sync while one is running is rejected with 409", async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const restores = [
        stub(Player, "find", () => ({ select: () => ({ lean: async () => [ { fplId: 1 } ] }) })),
        stub(fplService, "getPlayerGameweek", async () => { await gate; return { history: [], history_past: [] } }),
        stub(PlayerGameweek, "bulkWrite", async () => ({})),
        stub(PlayerSeason, "bulkWrite", async () => ({}))
    ]

    try {
        const first = syncAllPlayersHistory()
        await new Promise((resolve) => setImmediate(resolve))

        await assert.rejects(syncAllPlayersHistory(), (error) => error.statusCode === 409)

        release()
        const result = await first
        assert.equal(result.successful, 1)
    } finally {
        restores.forEach((restore) => restore())
    }
})
