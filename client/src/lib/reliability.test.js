import { describe, expect, it } from "vitest"
import { BACKTEST, GOOD_WIN_RATE, RELIABILITY_BUCKETS, STRONG_WIN_RATE, reliabilityForGap } from "./reliability"

describe("the backtest table", () => {
    it("starts at a gap of 0", () => {
        expect(RELIABILITY_BUCKETS[0].from).toBe(0)
    })

    it("has no gaps or overlaps between buckets, so every gap lands in exactly one", () => {
        RELIABILITY_BUCKETS.slice(1).forEach((bucket, index) => {
            expect(bucket.from).toBe(RELIABILITY_BUCKETS[index].to)
        })
    })

    it("ends with an open-ended bucket, so a very large gap still has an answer", () => {
        expect(RELIABILITY_BUCKETS.at(-1).to).toBeNull()
        expect(RELIABILITY_BUCKETS.slice(0, -1).every((bucket) => bucket.to !== null)).toBe(true)
    })

    it("rises with the gap: a bigger predicted gap has never come off less often", () => {
        RELIABILITY_BUCKETS.slice(1).forEach((bucket, index) => {
            expect(bucket.winRate).toBeGreaterThanOrEqual(RELIABILITY_BUCKETS[index].winRate)
        })
    })

    it("is better than a coin flip everywhere, and never certain", () => {
        for (const { winRate } of RELIABILITY_BUCKETS) {
            expect(winRate).toBeGreaterThan(0.5)
            expect(winRate).toBeLessThan(1)
        }
    })

    it("adds up to the number of pairs it says it was built from", () => {
        expect(RELIABILITY_BUCKETS.reduce((sum, bucket) => sum + bucket.pairs, 0)).toBe(BACKTEST.pairs)
    })

    it("has a positive number of pairs behind every bucket", () => {
        expect(RELIABILITY_BUCKETS.every((bucket) => bucket.pairs > 0)).toBe(true)
    })
})

describe("reliabilityForGap", () => {
    it.each([
        [0, 0.517],
        [0.1, 0.517],
        [0.3, 0.548],
        [0.75, 0.586],
        [1.2, 0.653],
        [1.7, 0.705],
        [2.5, 0.74],
        [4, 0.783],
    ])("a gap of %s has come off %s of the time", (gap, winRate) => {
        expect(reliabilityForGap(gap).winRate).toBe(winRate)
    })

    it("puts a gap exactly on a boundary in the higher bucket", () => {
        expect(reliabilityForGap(0.25).winRate).toBe(0.548)
        expect(reliabilityForGap(0.5).winRate).toBe(0.586)
        expect(reliabilityForGap(1).winRate).toBe(0.653)
        expect(reliabilityForGap(3).winRate).toBe(0.783)
    })

    it("treats a huge gap like the biggest bucket", () => {
        expect(reliabilityForGap(40).winRate).toBe(0.783)
    })

    it("never says a bigger gap is less reliable", () => {
        let previous = 0

        for (let gap = 0; gap <= 6; gap += 0.05) {
            const { winRate } = reliabilityForGap(gap)

            expect(winRate).toBeGreaterThanOrEqual(previous)
            previous = winRate
        }
    })

    it.each([[-0.1], [-5], [NaN], [Infinity], [null], [undefined], ["1.5"]])("has no answer for %s", (gap) => {
        expect(reliabilityForGap(gap)).toBeNull()
    })

    it.each([
        [0.1, "weak"],
        [0.3, "weak"],
        [0.75, "weak"],
        [1.2, "good"],
        [1.7, "strong"],
        [2.5, "strong"],
        [4, "strong"],
    ])("calls a gap of %s %s", (gap, level) => {
        expect(reliabilityForGap(gap).level).toBe(level)
    })

    it("draws the lines at 60% and 70%", () => {
        expect(GOOD_WIN_RATE).toBe(0.6)
        expect(STRONG_WIN_RATE).toBe(0.7)
    })

    it("words it as a rounded percentage", () => {
        expect(reliabilityForGap(0.75).label).toBe("right 59% of the time")
        expect(reliabilityForGap(4).label).toBe("right 78% of the time")
    })

    it("explains where the number comes from, with the pair count, the range and the caveats", () => {
        const { detail } = reliabilityForGap(0.75)

        expect(detail).toContain("22,956 past same-position pairs")
        expect(detail).toContain("0.5 to 1 points higher")
        expect(detail).toContain("59% of the time")
        expect(detail).toContain("tied are left out")
        expect(detail).toContain(`Gameweeks ${BACKTEST.gameweeks}`)
        expect(detail).toContain("Ignores any transfer hit")
    })

    it("describes the smallest and largest ranges in plain words", () => {
        expect(reliabilityForGap(0.1).detail).toContain("less than 0.25 points higher")
        expect(reliabilityForGap(5).detail).toContain("3 or more points higher")
    })
})
