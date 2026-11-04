import { describe, expect, it } from "vitest"
import { getFlag, ROTATION_THRESHOLD } from "./flags"
import { prediction, withAvailability } from "../test/fixtures"

describe("getFlag", () => {
    it("says a player with no prediction has no fixture", () => {
        expect(getFlag(null).level).toBe("blank")
        expect(getFlag({ playerId: 5 }).level).toBe("blank")
    })

    it("marks a fit, regular player ok", () => {
        expect(getFlag(prediction()).level).toBe("ok")
    })

    it("marks a 0% chance of playing as out", () => {
        const flag = getFlag(withAvailability("i", 0, { news: "Hamstring injury" }))

        expect(flag.level).toBe("out")
        expect(flag.detail).toBe("Hamstring injury")
    })

    it.each(["i", "s", "u", "n"])("marks status %s as out when there is no percentage", (status) => {
        expect(getFlag(withAvailability(status, null)).level).toBe("out")
    })

    it("does not treat an unavailable status as out when FPL gives a real chance", () => {
        expect(getFlag(withAvailability("i", 0.5)).level).toBe("doubtful")
    })

    it("marks a partial chance as doubtful and shows the percentage", () => {
        const flag = getFlag(withAvailability("d", 0.75, { news: "Knock - 75% chance of playing" }))

        expect(flag.level).toBe("doubtful")
        expect(flag.label).toBe("Doubtful 75%")
        expect(flag.detail).toBe("Knock - 75% chance of playing")
    })

    it("falls back to the percentage as the detail when there is no news", () => {
        expect(getFlag(withAvailability("d", 0.5)).detail).toBe("50% chance of playing")
    })

    it("marks status d with no percentage as doubtful", () => {
        const flag = getFlag(withAvailability("d", null))

        expect(flag.level).toBe("doubtful")
        expect(flag.label).toBe("Doubtful")
    })

    it("lets out win over doubtful", () => {
        expect(getFlag(withAvailability("d", 0)).level).toBe("out")
    })

    it("flags a fit player the model expects to be left out as a rotation risk", () => {
        const flag = getFlag(prediction({ appearance_probability: 0.4 }))

        expect(flag.level).toBe("rotation")
        expect(flag.detail).toBe("Model gives 40% chance of playing")
    })

    it("treats exactly the threshold as fine", () => {
        expect(getFlag(prediction({ appearance_probability: ROTATION_THRESHOLD })).level).toBe("ok")
        expect(getFlag(prediction({ appearance_probability: ROTATION_THRESHOLD - 0.01 })).level).toBe("rotation")
    })

    it("lets doubtful win over rotation", () => {
        expect(getFlag(withAvailability("d", 0.5, { appearance_probability: 0.2 })).level).toBe("doubtful")
    })

    it("lets out win over rotation", () => {
        expect(getFlag(withAvailability("i", 0, { appearance_probability: 0.1 })).level).toBe("out")
    })
})
