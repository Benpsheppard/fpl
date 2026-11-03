const test = require("node:test")
const assert = require("node:assert/strict")

const { getWithRetry } = require("../services/httpRetry")
const { withSyncLock, SyncInProgressError } = require("../services/syncLock")
const { getCachedDataset, invalidateDatasetCache } = require("../services/datasetCache")

const httpError = (status, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } })

const scripted = (...outcomes) => {
    const calls = []
    const get = async (url, options) => {
        calls.push({ url, options })
        const outcome = outcomes[Math.min(calls.length, outcomes.length) - 1]
        if (outcome instanceof Error) {
            throw outcome
        }
        return outcome
    }
    get.calls = calls
    return get
}

const recordingSleep = () => {
    const delays = []
    const sleep = async (ms) => { delays.push(ms) }
    sleep.delays = delays
    return sleep
}

test("getWithRetry sends a timeout and returns the response", async () => {
    const get = scripted({ data: 1 })

    const response = await getWithRetry("http://x", { get, sleep: recordingSleep() })

    assert.deepEqual(response, { data: 1 })
    assert.ok(get.calls[0].options.timeout > 0)
})

test("getWithRetry retries 429 and 5xx with growing delays", async () => {
    const get = scripted(httpError(429), httpError(503), { data: "ok" })
    const sleep = recordingSleep()

    const response = await getWithRetry("http://x", { get, sleep, baseDelayMs: 100 })

    assert.equal(response.data, "ok")
    assert.deepEqual(sleep.delays, [100, 200])
})

test("getWithRetry retries network errors that have no response", async () => {
    const get = scripted(new Error("ECONNRESET"), { data: "ok" })

    const response = await getWithRetry("http://x", { get, sleep: recordingSleep() })

    assert.equal(response.data, "ok")
    assert.equal(get.calls.length, 2)
})

test("getWithRetry does not retry other client errors", async () => {
    const get = scripted(httpError(404))

    await assert.rejects(getWithRetry("http://x", { get, sleep: recordingSleep() }), /404/)
    assert.equal(get.calls.length, 1)
})

test("getWithRetry gives up after the retry limit", async () => {
    const get = scripted(httpError(500))

    await assert.rejects(getWithRetry("http://x", { get, sleep: recordingSleep(), retries: 2 }), /500/)
    assert.equal(get.calls.length, 3)
})

test("getWithRetry waits at least as long as Retry-After asks", async () => {
    const get = scripted(httpError(429, { "retry-after": "3" }), { data: "ok" })
    const sleep = recordingSleep()

    await getWithRetry("http://x", { get, sleep, baseDelayMs: 100 })

    assert.deepEqual(sleep.delays, [3000])
})

test("only one sync runs at a time, and the lock is released afterwards", async () => {
    let release
    const first = withSyncLock("first", () => new Promise((resolve) => { release = resolve }))

    await assert.rejects(withSyncLock("second", async () => {}), (error) => {
        assert.ok(error instanceof SyncInProgressError)
        assert.equal(error.statusCode, 409)
        assert.match(error.message, /first/)
        return true
    })

    release("done")
    assert.equal(await first, "done")
    assert.equal(await withSyncLock("third", async () => "ran"), "ran")
})

test("the lock is released when a sync fails", async () => {
    await assert.rejects(withSyncLock("failing", async () => { throw new Error("boom") }), /boom/)
    assert.equal(await withSyncLock("next", async () => "ran"), "ran")
})

test("dataset cache builds once, shares concurrent builds, and rebuilds after invalidation", async () => {
    invalidateDatasetCache()
    let builds = 0
    const build = async () => { builds++; return [ builds ] }

    const [ a, b ] = await Promise.all([ getCachedDataset(build), getCachedDataset(build) ])
    assert.equal(builds, 1)
    assert.strictEqual(a, b)

    await getCachedDataset(build)
    assert.equal(builds, 1)

    invalidateDatasetCache()
    assert.deepEqual(await getCachedDataset(build), [ 2 ])
})

test("a build that overlaps a sync is not cached", async () => {
    invalidateDatasetCache()
    let builds = 0
    let release
    const slowBuild = () => new Promise((resolve) => { builds++; release = () => resolve([ "stale" ]) })

    const pending = getCachedDataset(slowBuild)
    invalidateDatasetCache() // a sync lands mid-build
    release()
    assert.deepEqual(await pending, [ "stale" ])

    assert.deepEqual(await getCachedDataset(async () => [ "fresh" ]), [ "fresh" ])
})
