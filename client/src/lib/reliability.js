// reliability.js
//
// How often a swap of a given size has actually come off. This comes from backtesting the model on past
// gameweeks: for every pair of regular players in the same position, did the player the model rated higher
// really score more? The bigger the predicted gap, the more often it did.
//
// These figures are a snapshot. To refresh them after more gameweeks or a model change, call
// GET :8001/dataset/test/backtest and copy model.regulars.buckets here (and update BACKTEST).

export const BACKTEST = { gameweeks: "3 to 9", pairs: 100007 }

// Predicted gap in points -> the share of past pairs where the higher-rated player scored more
// (pairs that tied on points are left out). Contiguous, from 0, with the last bucket open-ended.
export const RELIABILITY_BUCKETS = [
    { from: 0, to: 0.25, winRate: 0.517, pairs: 13679 },
    { from: 0.25, to: 0.5, winRate: 0.548, pairs: 13162 },
    { from: 0.5, to: 1, winRate: 0.586, pairs: 22956 },
    { from: 1, to: 1.5, winRate: 0.653, pairs: 18099 },
    { from: 1.5, to: 2, winRate: 0.705, pairs: 13084 },
    { from: 2, to: 3, winRate: 0.74, pairs: 13280 },
    { from: 3, to: null, winRate: 0.783, pairs: 5747 },
]

// Below GOOD a swap is weak (close to a coin flip); from STRONG up it is strong
export const GOOD_WIN_RATE = 0.6
export const STRONG_WIN_RATE = 0.7

const describeRange = ({ from, to }) => {
    if (from === 0) return `less than ${to} points`
    if (to === null) return `${from} or more points`

    return `${from} to ${to} points`
}

// How far to trust a swap whose predicted gain is `gap` points. Null when the gap is not a usable number.
export const reliabilityForGap = (gap) => {
    if (!Number.isFinite(gap) || gap < 0) {
        return null
    }

    const bucket = RELIABILITY_BUCKETS.find(({ from, to }) => gap >= from && (to === null || gap < to))
    const percent = Math.round(bucket.winRate * 100)

    return {
        winRate: bucket.winRate,
        level: bucket.winRate >= STRONG_WIN_RATE ? "strong" : bucket.winRate >= GOOD_WIN_RATE ? "good" : "weak",
        label: `right ${percent}% of the time`,
        detail: `In ${bucket.pairs.toLocaleString("en-GB")} past same-position pairs where the model rated one player `
            + `${describeRange(bucket)} higher, the higher-rated player scored more ${percent}% of the time `
            + `(pairs that tied are left out). Gameweeks ${BACKTEST.gameweeks}. Ignores any transfer hit.`,
    }
}
