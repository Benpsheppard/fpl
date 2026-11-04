import { describe, expect, it, vi } from "vitest"
import { ApiError, describeFailure, loadAll } from "./api"

// A fake fetch that answers by URL
const fakeFetch = (routes) => vi.fn(async (url) => {
    const match = Object.entries(routes).find(([fragment]) => url.includes(fragment))
    const result = match?.[1]

    if (result instanceof Error) {
        throw result
    }

    return {
        ok: result.status === undefined || result.status < 400,
        status: result.status ?? 200,
        json: async () => {
            if (result.noBody) throw new Error("no body")
            return result.body
        },
    }
})

const good = {
    "/predict": { body: { players: [{ playerId: 1 }], warnings: [] } },
    "/api/my-team": { body: { squad: [] } },
    "/api/teams": { body: [{ fplId: 1, name: "Arsenal" }] },
}

describe("loadAll", () => {
    it("returns predictions, your team and the clubs", async () => {
        const result = await loadAll({ fetchImpl: fakeFetch(good) })

        expect(result.predictions.players).toHaveLength(1)
        expect(result.team).toEqual({ squad: [] })
        expect(result.teams[0].name).toBe("Arsenal")
        expect(result.problems).toEqual({ team: null, teams: null })
    })

    it("asks for the gameweeks ahead only when there is more than one", async () => {
        const urls = async (options) => {
            const fetchImpl = fakeFetch(good)
            await loadAll({ fetchImpl, ...options })
            return fetchImpl.mock.calls.map(([url]) => url)
        }

        expect((await urls({ horizon: 3 })).some((url) => url.endsWith("/predict?limit=1000&horizon=3"))).toBe(true)
        expect((await urls({ horizon: 1 })).some((url) => url.includes("horizon"))).toBe(false)
        // Only predictions take a horizon
        expect((await urls({ horizon: 3 })).filter((url) => url.includes("horizon"))).toHaveLength(1)
    })

    it("asks for every player in one request", async () => {
        const fetchImpl = fakeFetch(good)

        await loadAll({ fetchImpl })

        expect(fetchImpl.mock.calls.map(([url]) => url).some((url) => url.endsWith("/predict?limit=1000"))).toBe(true)
        expect(fetchImpl).toHaveBeenCalledTimes(3)
    })

    it("still works when your team can't be loaded, and says why", async () => {
        const result = await loadAll({ fetchImpl: fakeFetch({ ...good, "/api/my-team": { status: 503, body: { message: "x" } } }) })

        expect(result.predictions.players).toHaveLength(1)
        expect(result.team).toBeNull()
        expect(result.problems.team).toMatch(/MY_FPL_MANAGER_ID/)
    })

    it("still works without the club names", async () => {
        const result = await loadAll({ fetchImpl: fakeFetch({ ...good, "/api/teams": { status: 500, body: {} } }) })

        expect(result.teams).toEqual([])
        expect(result.problems.teams).toBeTruthy()
    })

    it("fails when predictions fail, because there is nothing to show", async () => {
        const fetchImpl = fakeFetch({ ...good, "/predict": { status: 503, body: { detail: "No trained model found." } } })

        await expect(loadAll({ fetchImpl })).rejects.toThrow(/hasn't been trained/)
    })

    it("explains a service that isn't running", async () => {
        const fetchImpl = fakeFetch({ ...good, "/predict": new TypeError("Failed to fetch") })

        const error = await loadAll({ fetchImpl }).catch((e) => e)

        expect(error).toBeInstanceOf(ApiError)
        expect(error.message).toMatch(/Can't reach the predictions service at .*8001.*Is it running/)
    })

    it("passes a cancelled request through instead of reporting it as an error", async () => {
        const abort = Object.assign(new Error("aborted"), { name: "AbortError" })

        await expect(loadAll({ fetchImpl: fakeFetch({ ...good, "/predict": abort }) })).rejects.toMatchObject({ name: "AbortError" })
    })

    it("copes with an error response that has no JSON body", async () => {
        const fetchImpl = fakeFetch({ ...good, "/predict": { status: 500, noBody: true } })

        await expect(loadAll({ fetchImpl })).rejects.toThrow(/predictions request failed \(500\)/)
    })
})

describe("describeFailure", () => {
    it("tells you how to train the model", () => {
        expect(describeFailure({ service: "predictions", status: 503 })).toMatch(/npm run refresh/)
    })

    it("explains when the prediction service can't reach the data service", () => {
        expect(describeFailure({ service: "predictions", status: 502 })).toMatch(/Node server/)
    })

    it("passes on the server's detail for a schema mismatch", () => {
        expect(describeFailure({ service: "predictions", status: 409, detail: "Retrain the model" })).toBe("Retrain the model")
    })

    it("explains the three ways your team can fail to load", () => {
        expect(describeFailure({ service: "team", status: 503 })).toMatch(/server\/\.env/)
        expect(describeFailure({ service: "team", status: 404 })).toMatch(/no manager/)
        expect(describeFailure({ service: "team", status: 502 })).toMatch(/FPL website/)
    })

    it("falls back to the status and detail for anything else", () => {
        expect(describeFailure({ service: "teams", status: 418, detail: "teapot" })).toBe("The teams request failed (418): teapot")
        expect(describeFailure({ service: "teams", status: 418 })).toBe("The teams request failed (418)")
    })
})
