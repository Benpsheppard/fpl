import { describe, expect, it } from "vitest"
import { describeWindow, forHorizon, hasMeasuredReliability, minGainForHorizon } from "./horizon"

const withOutlook = (expected, total, extra = {}) => ({
    playerId: 1, gameweek: 10, expected_points: expected,
    outlook: { from_gameweek: 10, to_gameweek: 12, total_expected_points: total },
    ...extra,
})

describe("forHorizon", () => {
    it("leaves a one-gameweek view alone", () => {
        const players = [withOutlook(4, 11)]

        expect(forHorizon(players, 1)).toBe(players)
    })

    it("makes the total over the window the player's expected points, keeping the next gameweek's", () => {
        const [player] = forHorizon([withOutlook(4, 11)], 3)

        expect(player.expected_points).toBe(11)
        expect(player.next_gameweek_points).toBe(4)
    })

    it("leaves a player with no outlook as they are", () => {
        const plain = { playerId: 2, expected_points: 3 }

        expect(forHorizon([plain], 3)).toEqual([plain])
    })

    it("does not change the players it is given", () => {
        const players = [withOutlook(4, 11)]

        forHorizon(players, 3)

        expect(players[0].expected_points).toBe(4)
    })
})

describe("describeWindow", () => {
    it("names one gameweek", () => {
        expect(describeWindow([{ gameweek: 10 }], 1)).toBe("gameweek 10")
    })

    it("names the range of gameweeks", () => {
        expect(describeWindow([withOutlook(4, 11)], 3)).toBe("gameweeks 10 to 12")
    })

    it("falls back to the next gameweek if nobody has an outlook", () => {
        expect(describeWindow([{ gameweek: 10 }], 3)).toBe("gameweek 10")
    })

    it("has nothing to say without players", () => {
        expect(describeWindow([], 1)).toBe(null)
    })
})

describe("what is known about reliability", () => {
    it("has a measured track record for one gameweek only", () => {
        expect(hasMeasuredReliability(1)).toBe(true)
        expect(hasMeasuredReliability(3)).toBe(false)
    })

    it("asks for a bigger gain over a longer window, but not in proportion", () => {
        expect(minGainForHorizon(0.5, 1)).toBe(0.5)
        expect(minGainForHorizon(0.5, 5)).toBeGreaterThan(0.5)
        expect(minGainForHorizon(0.5, 5)).toBeLessThan(2.5)
    })
})
