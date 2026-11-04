const test = require("node:test")
const assert = require("node:assert/strict")

const Team = require("../models/teamModel")
const myTeamService = require("../services/myTeamService")
const { createApp } = require("../app")

const { computeSellPrice, resolvePurchasePrice, applyPendingTransfers, getMyTeam } = myTeamService

// --- sell price ------------------------------------------------------------

test("a price that has not moved sells for the same", () => {
    assert.equal(computeSellPrice(55, 55), 55)
})

test("a rise is split: you keep half, rounded down to 0.1m", () => {
    assert.equal(computeSellPrice(50, 51), 50) // +0.1 -> half is 0.05, rounds down to nothing
    assert.equal(computeSellPrice(50, 52), 51) // +0.2 -> +0.1
    assert.equal(computeSellPrice(50, 53), 51) // +0.3 -> +0.1 (0.15 rounds down)
    assert.equal(computeSellPrice(50, 56), 53) // +0.6 -> +0.3
})

test("a fall is taken in full", () => {
    assert.equal(computeSellPrice(50, 48), 48)
    assert.equal(computeSellPrice(50, 49), 49)
})

// --- purchase price --------------------------------------------------------

const player = { fplId: 7, nowCost: 60, costChangeStart: 4 }

test("the purchase price is what the latest transfer in cost", () => {
    const transfers = [
        { element_in: 7, element_in_cost: 52, time: "2025-09-01T10:00:00Z" },
        { element_in: 99, element_in_cost: 80, time: "2025-09-02T10:00:00Z" }
    ]

    assert.equal(resolvePurchasePrice(player, transfers), 52)
})

test("a player bought, sold and bought back uses the latest purchase", () => {
    const transfers = [
        { element_in: 7, element_in_cost: 52, time: "2025-09-01T10:00:00Z" },
        { element_in: 7, element_in_cost: 58, time: "2025-10-20T10:00:00Z" }
    ]

    assert.equal(resolvePurchasePrice(player, transfers), 58)
})

test("with no transfer in, the purchase price is the start-of-season price", () => {
    assert.equal(resolvePurchasePrice(player, []), 56) // 60 now, up 4 since the start
    assert.equal(resolvePurchasePrice({ fplId: 7, nowCost: 45, costChangeStart: -3 }, []), 48) // fallen 3
    assert.equal(resolvePurchasePrice({ fplId: 7, nowCost: 45 }, []), 45) // no change recorded
})

// --- pending transfers -----------------------------------------------------

const picks = () => [
    { element: 1, position: 1, is_captain: false, is_vice_captain: false },
    { element: 2, position: 2, is_captain: true, is_vice_captain: false },
    { element: 3, position: 3, is_captain: false, is_vice_captain: true }
]

test("transfers up to the picks gameweek are already in the picks", () => {
    const result = applyPendingTransfers(picks(), 12, [
        { event: 9, element_in: 50, element_out: 1, element_in_cost: 40, element_out_cost: 45, time: "2025-10-30T10:00:00Z" }
    ], 9)

    assert.deepEqual(result.picks.map((pick) => pick.element), [1, 2, 3])
    assert.equal(result.bank, 12)
    assert.equal(result.applied, 0)
})

test("a later transfer swaps the player into the same slot and moves the bank", () => {
    const result = applyPendingTransfers(picks(), 12, [
        { event: 10, element_in: 50, element_out: 3, element_in_cost: 40, element_out_cost: 47, time: "2025-11-01T10:00:00Z" }
    ], 9)

    assert.deepEqual(result.picks.map((pick) => [pick.position, pick.element]), [[1, 1], [2, 2], [3, 50]])
    assert.equal(result.bank, 12 + 47 - 40)
    assert.equal(result.applied, 1)
})

test("the incoming player does not inherit the armband", () => {
    const result = applyPendingTransfers(picks(), 0, [
        { event: 10, element_in: 50, element_out: 2, element_in_cost: 40, element_out_cost: 40, time: "2025-11-01T10:00:00Z" }
    ], 9)

    const slot = result.picks.find((pick) => pick.element === 50)
    assert.equal(slot.is_captain, false)
    assert.equal(slot.is_vice_captain, false)
})

test("several transfers are applied in the order they were made", () => {
    // 3 -> 50, then 50 -> 60: only works if applied in time order
    const result = applyPendingTransfers(picks(), 0, [
        { event: 10, element_in: 60, element_out: 50, element_in_cost: 30, element_out_cost: 40, time: "2025-11-02T10:00:00Z" },
        { event: 10, element_in: 50, element_out: 3, element_in_cost: 40, element_out_cost: 40, time: "2025-11-01T10:00:00Z" }
    ], 9)

    assert.deepEqual(result.picks.map((pick) => pick.element), [1, 2, 60])
    assert.equal(result.applied, 2)
    assert.equal(result.bank, 10)
})

test("a transfer that does not match the squad is ignored, not guessed at", () => {
    const result = applyPendingTransfers(picks(), 12, [
        { event: 10, element_in: 50, element_out: 999, element_in_cost: 40, element_out_cost: 40, time: "2025-11-01T10:00:00Z" }
    ], 9)

    assert.deepEqual(result.picks.map((pick) => pick.element), [1, 2, 3])
    assert.equal(result.bank, 12)
    assert.deepEqual([result.applied, result.ignored], [0, 1])
})

test("the input picks are not modified", () => {
    const original = picks()

    applyPendingTransfers(original, 0, [
        { event: 10, element_in: 50, element_out: 3, element_in_cost: 40, element_out_cost: 40, time: "2025-11-01T10:00:00Z" }
    ], 9)

    assert.deepEqual(original, picks())
})

// --- getMyTeam -------------------------------------------------------------

const pick = (element, position, extra = {}) => ({ element, position, is_captain: false, is_vice_captain: false, element_type: 3, ...extra })

const fakeFpl = ({ currentEvent = 9, picksByEvent, transfers = [], bank = 12, chipByEvent = {} }) => ({
    getManager: async () => ({ name: "My Team", current_event: currentEvent }),
    getManagerTransfers: async () => transfers,
    getManagerGameweek: async (managerId, event) => ({
        active_chip: chipByEvent[event] ?? null,
        entry_history: { bank, value: 1000 },
        picks: picksByEvent[event]
    })
})

const fakePlayers = (docs) => ({
    find: (query) => ({ lean: async () => docs.filter((doc) => query.fplId.$in.includes(doc.fplId)) })
})

const docs = [
    { fplId: 1, webName: "Keeper", team: 5, elementType: 1, status: "a", news: "", nowCost: 50, costChangeStart: 0 },
    { fplId: 2, webName: "Mid", team: 6, elementType: 3, status: "d", news: "Knock - 75% chance of playing", nowCost: 80, costChangeStart: 3 },
    { fplId: 3, webName: "Forward", team: 7, elementType: 4, status: "a", news: "", nowCost: 100, costChangeStart: 0 },
    { fplId: 50, webName: "Incoming", team: 8, elementType: 3, status: "a", news: "", nowCost: 65, costChangeStart: 0 }
]

test("the squad comes back in millions with sell prices and the bank", async () => {
    const team = await getMyTeam(1, {
        fpl: fakeFpl({
            picksByEvent: { 9: [ pick(1, 1), pick(2, 2, { is_captain: true }), pick(3, 3) ] },
            // Player 2 cost 7.8m, now 8.0m: up 0.2 so you keep 0.1
            transfers: [ { event: 4, element_in: 2, element_in_cost: 78, element_out: 90, element_out_cost: 70, time: "2025-09-20T10:00:00Z" } ]
        }),
        PlayerModel: fakePlayers(docs)
    })

    assert.equal(team.teamName, "My Team")
    assert.equal(team.bank, 1.2)
    assert.equal(team.basedOnGameweek, 9)

    const mid = team.squad.find((player) => player.playerId === 2)
    assert.deepEqual(
        [mid.nowPrice, mid.purchasePrice, mid.sellPrice, mid.isCaptain, mid.news],
        [8, 7.8, 7.9, true, "Knock - 75% chance of playing"]
    )

    // A player never transferred in sells from the start-of-season price
    assert.equal(team.squad.find((player) => player.playerId === 1).sellPrice, 5)
    assert.equal(team.squadValue, 5 + 7.9 + 10)
})

test("pending transfers change the squad, the bank and the sell prices", async () => {
    const team = await getMyTeam(1, {
        fpl: fakeFpl({
            picksByEvent: { 9: [ pick(1, 1), pick(2, 2), pick(3, 3) ] },
            transfers: [ { event: 10, element_in: 50, element_out: 3, element_in_cost: 65, element_out_cost: 100, time: "2025-11-02T10:00:00Z" } ]
        }),
        PlayerModel: fakePlayers(docs)
    })

    assert.deepEqual(team.squad.map((player) => player.playerId), [1, 2, 50])
    assert.equal(team.pendingTransfers.applied, 1)
    assert.equal(team.bank, (12 + 100 - 65) / 10)
    assert.equal(team.squad.find((player) => player.playerId === 50).sellPrice, 6.5)
})

test("on a Free Hit week the real team is the previous gameweek's", async () => {
    const team = await getMyTeam(1, {
        fpl: fakeFpl({
            currentEvent: 5,
            chipByEvent: { 5: "freehit" },
            picksByEvent: {
                4: [ pick(1, 1), pick(2, 2), pick(3, 3) ],
                5: [ pick(50, 1), pick(50, 2), pick(50, 3) ] // the one-week Free Hit squad
            },
            transfers: [
                // Made for the Free Hit week and reverted with it
                { event: 5, element_in: 50, element_out: 1, element_in_cost: 65, element_out_cost: 50, time: "2025-10-01T10:00:00Z" }
            ]
        }),
        PlayerModel: fakePlayers(docs)
    })

    assert.equal(team.basedOnGameweek, 4)
    assert.equal(team.currentGameweek, 5)
    assert.deepEqual(team.squad.map((player) => player.playerId), [1, 2, 3])
    assert.equal(team.pendingTransfers.applied, 0)
})

test("a transfer made after a Free Hit week still applies", async () => {
    const team = await getMyTeam(1, {
        fpl: fakeFpl({
            currentEvent: 5,
            chipByEvent: { 5: "freehit" },
            picksByEvent: { 4: [ pick(1, 1), pick(2, 2), pick(3, 3) ], 5: [ pick(50, 1), pick(50, 2), pick(50, 3) ] },
            transfers: [ { event: 6, element_in: 50, element_out: 3, element_in_cost: 65, element_out_cost: 100, time: "2025-10-08T10:00:00Z" } ]
        }),
        PlayerModel: fakePlayers(docs)
    })

    assert.deepEqual(team.squad.map((player) => player.playerId), [1, 2, 50])
})

test("a player missing from the database still appears, with unknown prices", async () => {
    const team = await getMyTeam(1, {
        fpl: fakeFpl({ picksByEvent: { 9: [ pick(1, 1), pick(777, 2) ] } }),
        PlayerModel: fakePlayers(docs)
    })

    const unknown = team.squad.find((player) => player.playerId === 777)
    assert.deepEqual([unknown.webName, unknown.nowPrice, unknown.sellPrice], [null, null, null])
})

// --- HTTP ------------------------------------------------------------------

const withServer = async (fn) => {
    const server = createApp().listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    try {
        return await fn(`http://127.0.0.1:${server.address().port}`)
    } finally {
        await new Promise((resolve) => server.close(resolve))
    }
}

const withEnv = async (value, fn) => {
    const previous = process.env.MY_FPL_MANAGER_ID
    if (value === undefined) delete process.env.MY_FPL_MANAGER_ID
    else process.env.MY_FPL_MANAGER_ID = value
    try {
        return await fn()
    } finally {
        if (previous === undefined) delete process.env.MY_FPL_MANAGER_ID
        else process.env.MY_FPL_MANAGER_ID = previous
    }
}

const withService = async (replacement, fn) => {
    const original = myTeamService.getMyTeam
    myTeamService.getMyTeam = replacement
    const originalError = console.error
    console.error = () => {}
    try {
        return await fn()
    } finally {
        myTeamService.getMyTeam = original
        console.error = originalError
    }
}

test("my-team is closed with 503 when no manager is configured", () => withEnv(undefined, () => withServer(async (base) => {
    const response = await fetch(`${base}/api/my-team`)

    assert.equal(response.status, 503)
    assert.match((await response.json()).message, /MY_FPL_MANAGER_ID/)
})))

test("my-team rejects a manager id that is not a number", () => withEnv("abc", () => withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/my-team`)).status, 503)
})))

test("my-team needs no API key and uses the configured manager", () => withEnv("4321", () => withServer(async (base) => {
    const seen = []
    await withService(async (managerId) => { seen.push(managerId); return { teamName: "Mine", squad: [] } }, async () => {
        const response = await fetch(`${base}/api/my-team`)

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { teamName: "Mine", squad: [] })
    })

    assert.deepEqual(seen, [4321])
})))

test("my-team says so when FPL has no such manager", () => withEnv("4321", () => withServer(async (base) => {
    await withService(async () => { throw Object.assign(new Error("not found"), { response: { status: 404 } }) }, async () => {
        const response = await fetch(`${base}/api/my-team`)

        assert.equal(response.status, 404)
        assert.match((await response.json()).message, /no manager/)
    })
})))

test("my-team returns 502 when FPL is unreachable, without leaking details", () => withEnv("4321", () => withServer(async (base) => {
    await withService(async () => { throw new Error("connect ECONNREFUSED secret-host:443") }, async () => {
        const response = await fetch(`${base}/api/my-team`)
        const body = await response.json()

        assert.equal(response.status, 502)
        assert.doesNotMatch(JSON.stringify(body), /secret-host/)
    })
})))

test("teams lists club names in the shape the client needs", () => withServer(async (base) => {
    const original = Team.find
    Team.find = () => {
        const q = { select: () => q, sort: () => q, lean: async () => [
            { _id: "x", fplId: 1, code: 3, name: "Arsenal", shortName: "ARS", strength: 4 },
            { _id: "y", fplId: 2, code: 7, name: "Aston Villa", shortName: "AVL", strength: 3 }
        ] }
        return q
    }

    try {
        const teams = await (await fetch(`${base}/api/teams`)).json()

        assert.deepEqual(teams, [
            { fplId: 1, code: 3, name: "Arsenal", shortName: "ARS" },
            { fplId: 2, code: 7, name: "Aston Villa", shortName: "AVL" }
        ])
    } finally {
        Team.find = original
    }
}))
