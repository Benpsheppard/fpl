import { describe, expect, it } from "vitest"
import { bestSwapByPlayer, bestSwapPerIncoming, suggestSwaps } from "./transfers"
import { getFlag } from "./flags"
import { prediction, withAvailability } from "../test/fixtures"

// An owned player as joinSquad produces them
const owned = (overrides = {}) => {
    const player = {
        playerId: 100,
        elementType: 3,
        team: 1,
        sellPrice: 6.0,
        expected_points: 3.0,
        ...overrides,
    }

    return { ...player, flag: overrides.flag ?? { level: "ok" } }
}

const candidate = (overrides = {}) => prediction({ playerId: 200, position: 3, team: 9, price: 6.0, expected_points: 5.0, ...overrides })

const swapsFor = (input) => suggestSwaps({ bank: 0, freeTransfers: 1, ...input })

describe("suggestSwaps", () => {
    it("suggests a better player at the same price and position", () => {
        const [swap] = swapsFor({ squad: [owned()], candidates: [candidate()] })

        expect(swap.out.playerId).toBe(100)
        expect(swap.in.playerId).toBe(200)
        expect(swap.gain).toBe(2)
        expect(swap.netGain).toBe(2)
        expect(swap.hitCost).toBe(0)
    })

    it("only suggests players in the same position", () => {
        const result = swapsFor({ squad: [owned()], candidates: [candidate({ position: 4 })] })

        expect(result).toEqual([])
    })

    it("never suggests someone you already own", () => {
        const squad = [owned(), owned({ playerId: 200, expected_points: 5.0, team: 9 })]

        const result = swapsFor({ squad, candidates: [candidate({ playerId: 200 })] })

        expect(result.every((swap) => swap.in.playerId !== 200)).toBe(true)
    })

    describe("budget", () => {
        it("allows a player costing exactly the sell price plus the bank", () => {
            const result = swapsFor({ squad: [owned({ sellPrice: 6.0 })], bank: 0.5, candidates: [candidate({ price: 6.5 })] })

            expect(result).toHaveLength(1)
            expect(result[0].bankAfter).toBe(0)
        })

        it("rejects a player costing a tenth more than you can afford", () => {
            const result = swapsFor({ squad: [owned({ sellPrice: 6.0 })], bank: 0.5, candidates: [candidate({ price: 6.6 })] })

            expect(result).toEqual([])
        })

        it("is not fooled by floating point (0.1 + 0.2 style) arithmetic", () => {
            // 5.9 + 0.7 is 6.6000000000000005 in floating point; the budget is exactly 6.6
            const result = swapsFor({ squad: [owned({ sellPrice: 5.9 })], bank: 0.7, candidates: [candidate({ price: 6.6 })] })

            expect(result).toHaveLength(1)
        })

        it("uses the sell price, not the current price", () => {
            // Price has risen to 7.0 but you'd only get 6.1 for them
            const result = swapsFor({ squad: [owned({ sellPrice: 6.1 })], candidates: [candidate({ price: 7.0 })] })

            expect(result).toEqual([])
        })

        it("reports how the swap changes the bank", () => {
            const [swap] = swapsFor({ squad: [owned({ sellPrice: 6.0 })], bank: 1.0, candidates: [candidate({ price: 5.5 })] })

            expect(swap.priceChange).toBe(0.5)
            expect(swap.bankAfter).toBe(1.5)
        })

        it("reports a swap that costs money as a negative price change", () => {
            const [swap] = swapsFor({ squad: [owned({ sellPrice: 6.0 })], bank: 1.0, candidates: [candidate({ price: 6.8 })] })

            expect(swap.priceChange).toBe(-0.8)
            expect(swap.bankAfter).toBeCloseTo(0.2)
        })

        it("skips an owned player whose sell price is unknown", () => {
            const result = swapsFor({ squad: [owned({ sellPrice: null })], bank: 50, candidates: [candidate({ price: 4 })] })

            expect(result).toEqual([])
        })

        it("skips a candidate with no known price", () => {
            const result = swapsFor({ squad: [owned()], bank: 50, candidates: [candidate({ price: null })] })

            expect(result).toEqual([])
        })
    })

    describe("three players per club", () => {
        const fullClub = (club) => [
            owned({ playerId: 11, team: club }),
            owned({ playerId: 12, team: club, elementType: 2 }),
            owned({ playerId: 13, team: club, elementType: 4 }),
        ]

        it("rejects a fourth player from a club", () => {
            const squad = [owned({ playerId: 100, team: 1 }), ...fullClub(9)]

            const result = swapsFor({ squad, candidates: [candidate({ team: 9 })] })

            expect(result.filter((swap) => swap.out.playerId === 100)).toEqual([])
        })

        it("allows a third player from a club", () => {
            const squad = [owned({ playerId: 100, team: 1 }), ...fullClub(9).slice(0, 2)]

            const result = swapsFor({ squad, candidates: [candidate({ team: 9 })] })

            expect(result.filter((swap) => swap.out.playerId === 100)).toHaveLength(1)
        })

        it("counts the player being sold as leaving, so a same-club swap is allowed", () => {
            // Three from club 9 already; swapping one of them for another club-9 player stays at three
            const squad = fullClub(9).map((player, index) => (index === 0 ? { ...player, elementType: 3, expected_points: 1 } : player))

            const result = swapsFor({ squad, candidates: [candidate({ team: 9 })] })

            expect(result.some((swap) => swap.out.playerId === 11)).toBe(true)
        })

        it("honours a different limit", () => {
            const squad = [owned({ playerId: 100, team: 1 }), owned({ playerId: 11, team: 9 })]

            const result = suggestSwaps({ squad, candidates: [candidate({ team: 9 })], bank: 0, freeTransfers: 1, maxPerClub: 1 })

            // Player 100 (club 1) can't take a second club-9 place, but player 11 can be replaced by another club-9 player
            expect(result.filter((swap) => swap.out.playerId === 100)).toEqual([])
            expect(result.filter((swap) => swap.out.playerId === 11)).toHaveLength(1)
        })
    })

    describe("transfer hits", () => {
        it("charges nothing while you have a free transfer", () => {
            const [swap] = swapsFor({ squad: [owned()], freeTransfers: 1, candidates: [candidate({ expected_points: 6 })] })

            expect(swap.hitCost).toBe(0)
            expect(swap.netGain).toBe(3)
        })

        it("takes 4 points off when you have none left", () => {
            const [swap] = swapsFor({ squad: [owned()], freeTransfers: 0, candidates: [candidate({ expected_points: 8 })] })

            expect(swap.hitCost).toBe(4)
            expect(swap.gain).toBe(5)
            expect(swap.netGain).toBe(1)
        })

        it("drops a swap whose gain does not cover the hit", () => {
            const result = swapsFor({ squad: [owned()], freeTransfers: 0, candidates: [candidate({ expected_points: 6 })] })

            expect(result).toEqual([])
        })
    })

    describe("minimum gain", () => {
        it("drops swaps that are better by less than the noise level", () => {
            const result = swapsFor({ squad: [owned({ expected_points: 4.8 })], candidates: [candidate({ expected_points: 5.0 })] })

            expect(result).toEqual([])
        })

        it("keeps a swap exactly at the minimum", () => {
            const result = swapsFor({ squad: [owned({ expected_points: 4.5 })], candidates: [candidate({ expected_points: 5.0 })] })

            expect(result).toHaveLength(1)
        })

        it("can be changed", () => {
            const result = suggestSwaps({ squad: [owned({ expected_points: 4.8 })], candidates: [candidate({ expected_points: 5.0 })], bank: 0, freeTransfers: 1, minNetGain: 0.1 })

            expect(result).toHaveLength(1)
        })

        it("asks for a bigger gain when the points cover several gameweeks", () => {
            const input = { squad: [owned({ expected_points: 4.4 })], candidates: [candidate({ expected_points: 5.0 })] }

            expect(swapsFor(input)).toHaveLength(1)
            expect(swapsFor({ ...input, horizon: 5 })).toEqual([])
        })

        it("says how many gameweeks a swap was judged over", () => {
            const [swap] = swapsFor({ squad: [owned()], candidates: [candidate({ expected_points: 12 })], horizon: 3 })

            expect(swap.horizon).toBe(3)
            expect(swapsFor({ squad: [owned()], candidates: [candidate()] })[0].horizon).toBe(1)
        })

        it("never suggests a worse player", () => {
            const result = swapsFor({ squad: [owned({ expected_points: 5 })], candidates: [candidate({ expected_points: 3 })] })

            expect(result).toEqual([])
        })
    })

    describe("who gets recommended", () => {
        it("never recommends buying a player who is out", () => {
            const out = withAvailability("i", 0, { playerId: 201, position: 3, team: 9, price: 6, expected_points: 9 })

            expect(getFlag(out).level).toBe("out")
            expect(swapsFor({ squad: [owned()], candidates: [out] })).toEqual([])
        })

        it("still recommends a doubtful player, who can be flagged on screen", () => {
            const doubtful = withAvailability("d", 0.75, { playerId: 202, position: 3, team: 9, price: 6, expected_points: 5 })

            expect(swapsFor({ squad: [owned()], candidates: [doubtful] })).toHaveLength(1)
        })

        it("treats a squad player with no prediction as worth nothing", () => {
            const noFixture = owned({ expected_points: undefined, flag: { level: "blank" } })

            const [swap] = swapsFor({ squad: [noFixture], candidates: [candidate({ expected_points: 4 })] })

            expect(swap.gain).toBe(4)
        })
    })

    describe("ordering", () => {
        it("ranks the biggest net gain first", () => {
            const squad = [owned({ playerId: 100, expected_points: 3 }), owned({ playerId: 101, team: 2, expected_points: 1 })]

            const result = swapsFor({ squad, candidates: [candidate({ expected_points: 5 })], perPlayer: 1 })

            expect(result.map((swap) => swap.out.playerId)).toEqual([101, 100])
        })

        it("puts swaps for a player who is out above bigger gains elsewhere", () => {
            const squad = [
                owned({ playerId: 100, expected_points: 1 }),
                owned({ playerId: 101, team: 2, expected_points: 3, flag: { level: "out" } }),
            ]

            const result = swapsFor({ squad, candidates: [candidate({ expected_points: 5 })], perPlayer: 1 })

            expect(result[0].out.playerId).toBe(101)
            expect(result[0].priority).toBe(true)
            expect(result[1].priority).toBe(false)
        })

        it("offers a limited number of options per player, best first", () => {
            const candidates = [3, 4, 5, 6].map((points, index) => candidate({ playerId: 300 + index, team: 20 + index, expected_points: points }))

            const result = swapsFor({ squad: [owned({ expected_points: 0 })], candidates, perPlayer: 2 })

            expect(result.map((swap) => swap.in.expected_points)).toEqual([6, 5])
        })

        it("returns nothing for an empty squad", () => {
            expect(swapsFor({ squad: [], candidates: [candidate()] })).toEqual([])
        })

        it("does not change what it is given", () => {
            const squad = [owned()]
            const candidates = [candidate()]
            const before = JSON.stringify({ squad, candidates })

            swapsFor({ squad, candidates })

            expect(JSON.stringify({ squad, candidates })).toBe(before)
        })
    })
})

describe("bestSwapByPlayer", () => {
    it("keeps the highest net gain for each owned player", () => {
        const a = { out: { playerId: 1 }, netGain: 2 }
        const b = { out: { playerId: 1 }, netGain: 5 }
        const c = { out: { playerId: 2 }, netGain: 1 }

        const best = bestSwapByPlayer([a, b, c])

        expect(best.get(1)).toBe(b)
        expect(best.get(2)).toBe(c)
        expect(best.size).toBe(2)
    })
})

describe("bench players", () => {
    // A starting XI position and a bench slot, both goalkeepers' worth of detail kept simple:
    // two midfielders start (4 and 6 points) and a third sits on the bench.
    const lineup = () => [
        owned({ playerId: 1, slot: 3, expected_points: 4, team: 1 }),
        owned({ playerId: 2, slot: 4, expected_points: 6, team: 2 }),
        owned({ playerId: 3, slot: 13, expected_points: 0.5, team: 3 }),
    ]

    it("values an upgrade to a bench player by the starter it would replace, not the bench player's own points", () => {
        const swaps = swapsFor({ squad: lineup(), candidates: [candidate({ expected_points: 7, team: 9 })] })

        const benchSwap = swaps.find((swap) => swap.out.playerId === 3)
        // 7 against the weakest starter (4), not against the bench player (0.5)
        expect(benchSwap.gain).toBe(3)
        expect(benchSwap.benchUpgrade).toBe(true)
    })

    it("sees no value in buying someone who wouldn't get in the team", () => {
        const swaps = swapsFor({ squad: lineup(), candidates: [candidate({ expected_points: 3.5, team: 9 })] })

        expect(swaps.find((swap) => swap.out.playerId === 3)).toBeUndefined()
    })

    it("still measures a starter against their own points", () => {
        const swaps = swapsFor({ squad: lineup(), candidates: [candidate({ expected_points: 7, team: 9 })], perPlayer: 1 })

        const starterSwap = swaps.find((swap) => swap.out.playerId === 2)
        expect(starterSwap.gain).toBe(1)
        expect(starterSwap.benchUpgrade).toBe(false)
    })

    it("treats a player with no known slot as a starter", () => {
        const [swap] = swapsFor({ squad: [owned({ slot: undefined, expected_points: 3 })], candidates: [candidate({ expected_points: 5 })] })

        expect(swap.gain).toBe(2)
        expect(swap.benchUpgrade).toBe(false)
    })

    it("does not rush to replace an injured bench player", () => {
        const squad = [
            ...lineup().slice(0, 2),
            owned({ playerId: 3, slot: 13, expected_points: 0, team: 3, flag: { level: "out" } }),
        ]

        const swaps = swapsFor({ squad, candidates: [candidate({ expected_points: 7, team: 9 })] })

        expect(swaps.find((swap) => swap.out.playerId === 3).priority).toBe(false)
    })

    it("still treats an injured starter as urgent", () => {
        const squad = [
            owned({ playerId: 1, slot: 3, expected_points: 0, team: 1, flag: { level: "out" } }),
            owned({ playerId: 2, slot: 4, expected_points: 6, team: 2 }),
        ]

        const swaps = swapsFor({ squad, candidates: [candidate({ expected_points: 5, team: 9 })] })

        expect(swaps.find((swap) => swap.out.playerId === 1).priority).toBe(true)
    })
})


describe("bestSwapPerIncoming", () => {
    const swap = (outId, inId, netGain, benchUpgrade = false) => ({ out: { playerId: outId }, in: { playerId: inId }, netGain, benchUpgrade })

    it("keeps one swap for each player being bought, the one with the highest gain", () => {
        const swaps = [swap(1, 50, 2), swap(2, 50, 3), swap(3, 51, 1)]

        const result = bestSwapPerIncoming(swaps)

        expect(result.map((s) => [s.out.playerId, s.in.playerId])).toEqual([[2, 50], [3, 51]])
    })

    it("prefers selling a starter over a bench player when the gain is the same", () => {
        const swaps = [swap(13, 50, 1.6, true), swap(4, 50, 1.6, false)]

        expect(bestSwapPerIncoming(swaps).map((s) => s.out.playerId)).toEqual([4])
    })

    it("keeps the order it was given", () => {
        const swaps = [swap(1, 50, 5), swap(2, 51, 4), swap(3, 52, 3)]

        expect(bestSwapPerIncoming(swaps).map((s) => s.in.playerId)).toEqual([50, 51, 52])
    })

    it("handles no swaps", () => {
        expect(bestSwapPerIncoming([])).toEqual([])
    })
})
