// transfers.js

import { getFlag } from "./flags"
//
// Single-swap suggestions: for each player you own, who you could buy instead. Prices are
// compared in tenths of a million so 0.1 + 0.2 style rounding errors can't decide a budget.

export const HIT_COST = 4
export const MAX_PER_CLUB = 3
// The model's typical error is about 1.2 points, so a smaller gain than this is noise
export const MIN_NET_GAIN = 0.5

const tenths = (millions) => Math.round(millions * 10)

// Squad slots 12-15 are the bench. Their points don't count unless an auto-sub brings them on.
export const FIRST_BENCH_SLOT = 12

const isBench = (player) => player.slot >= FIRST_BENCH_SLOT

// squad: owned players { playerId, elementType, team, slot, sellPrice, expected_points, flag }
// candidates: players you don't own (/predict rows)
// Returns swaps best first. Owned players who are out are marked priority.
export const suggestSwaps = ({
    squad,
    candidates,
    bank,
    freeTransfers,
    hitCost = HIT_COST,
    maxPerClub = MAX_PER_CLUB,
    minNetGain = MIN_NET_GAIN,
    perPlayer = 3,
}) => {
    const hit = freeTransfers >= 1 ? 0 : hitCost
    const ownedIds = new Set(squad.map((player) => player.playerId))
    const swaps = []

    // The weakest starter in each position. A bench player's replacement only adds points by taking
    // a starting place, so that is what it has to beat. (Formation rules and auto-subs are ignored.)
    const weakestStarter = new Map()
    for (const player of squad) {
        if (!isBench(player)) {
            const current = weakestStarter.get(player.elementType)
            const expected = player.expected_points ?? 0

            if (current === undefined || expected < current) {
                weakestStarter.set(player.elementType, expected)
            }
        }
    }

    for (const owned of squad) {
        // Without a sell price we can't tell what the player's slot could afford
        if (owned.sellPrice === null || owned.sellPrice === undefined) {
            continue
        }

        // What the squad loses if this player goes: a starter's own points, but nothing for a bench player
        const ownedExpected = isBench(owned) ? (weakestStarter.get(owned.elementType) ?? 0) : (owned.expected_points ?? 0)
        const budget = tenths(owned.sellPrice) + tenths(bank)

        // Clubs once this player has left, so selling a Spurs player makes room for another Spurs player
        const clubCounts = new Map()
        for (const other of squad) {
            if (other.playerId !== owned.playerId) {
                clubCounts.set(other.team, (clubCounts.get(other.team) ?? 0) + 1)
            }
        }

        const options = candidates
            .filter((candidate) => !ownedIds.has(candidate.playerId))
            .filter((candidate) => candidate.position === owned.elementType)
            .filter((candidate) => candidate.price !== null && candidate.price !== undefined && tenths(candidate.price) <= budget)
            .filter((candidate) => (clubCounts.get(candidate.team) ?? 0) < maxPerClub)
            // Never recommend buying someone who can't play
            .filter((candidate) => getFlag(candidate).level !== "out")
            .map((candidate) => {
                const gain = candidate.expected_points - ownedExpected

                return {
                    out: owned,
                    in: candidate,
                    gain,
                    hitCost: hit,
                    netGain: gain - hit,
                    // Negative means the swap costs money
                    priceChange: (tenths(owned.sellPrice) - tenths(candidate.price)) / 10,
                    bankAfter: (budget - tenths(candidate.price)) / 10,
                    // An injured bench player costs nothing this week, so it isn't urgent
                    priority: owned.flag?.level === "out" && !isBench(owned),
                    benchUpgrade: isBench(owned),
                }
            })
            .filter((swap) => swap.netGain >= minNetGain)
            .sort((a, b) => b.netGain - a.netGain)
            .slice(0, perPlayer)

        swaps.push(...options)
    }

    return swaps.sort((a, b) => (Number(b.priority) - Number(a.priority)) || (b.netGain - a.netGain))
}

// Buying the same player to replace three different people is one idea, not three. Keep each incoming
// player once, with the best player to sell for him (a starter before a bench player when it's a tie).
export const bestSwapPerIncoming = (swaps) => {
    const best = new Map()

    for (const swap of swaps) {
        const current = best.get(swap.in.playerId)
        const better = !current
            || swap.netGain > current.netGain
            || (swap.netGain === current.netGain && current.benchUpgrade && !swap.benchUpgrade)

        if (better) {
            best.set(swap.in.playerId, swap)
        }
    }

    // Keep the order the swaps were given in
    return swaps.filter((swap) => best.get(swap.in.playerId) === swap)
}

// The single best swap for each owned player, to mark them in the squad list
export const bestSwapByPlayer = (swaps) => {
    const best = new Map()

    for (const swap of swaps) {
        const current = best.get(swap.out.playerId)

        if (!current || swap.netGain > current.netGain) {
            best.set(swap.out.playerId, swap)
        }
    }

    return best
}
