const test = require("node:test")
const assert = require("node:assert/strict")

const { createApp } = require("../app")

// Real HTTP against the real app on a random port. Every request here is
// rejected or answered before it would reach Mongo or the FPL API.
const withServer = async (options, fn) => {
    const server = createApp(options).listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    const base = `http://127.0.0.1:${server.address().port}`

    try {
        return await fn(base)
    } finally {
        await new Promise((resolve) => server.close(resolve))
    }
}

const withApiKey = async (key, fn) => {
    const previous = process.env.API_KEY
    if (key === undefined) {
        delete process.env.API_KEY
    } else {
        process.env.API_KEY = key
    }

    try {
        return await fn()
    } finally {
        if (previous === undefined) {
            delete process.env.API_KEY
        } else {
            process.env.API_KEY = previous
        }
    }
}

const post = (base, path, headers = {}, body) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
})

// A path that passes auth but is stopped by param validation, so nothing external is called
const GUARDED_WRITE = "/api/fpl/sync-player-gameweek/not-a-number"

test("POST routes are rejected without an API key", () => withApiKey("secret", () => withServer({}, async (base) => {
    for (const path of [ GUARDED_WRITE, "/api/fpl/sync-bootstrap", "/api/fpl/sync-all-players" ]) {
        const response = await post(base, path)

        assert.equal(response.status, 401, path)
    }
})))

test("POST routes are rejected with the wrong API key", () => withApiKey("secret", () => withServer({}, async (base) => {
    assert.equal((await post(base, GUARDED_WRITE, { "x-api-key": "guess" })).status, 401)
    assert.equal((await post(base, GUARDED_WRITE, { "x-api-key": "secre" })).status, 401)
})))

test("with the right key a POST gets past auth", () => withApiKey("secret", () => withServer({}, async (base) => {
    const response = await post(base, GUARDED_WRITE, { "x-api-key": "secret" })

    assert.equal(response.status, 400)
})))

test("writes stay closed when no API key is configured", () => withApiKey(undefined, () => withServer({}, async (base) => {
    const response = await post(base, GUARDED_WRITE, { "x-api-key": "anything" })

    assert.equal(response.status, 503)
})))

test("reading does not need the API key", () => withApiKey("secret", () => withServer({}, async (base) => {
    // Rejected by param validation (400), not by auth (401)
    assert.equal((await fetch(`${base}/api/players/abc`)).status, 400)
})))

test("write requests are rate limited", () => withApiKey("secret", () => withServer({ writeLimit: 2 }, async (base) => {
    const statuses = []
    for (let i = 0; i < 4; i++) {
        statuses.push((await post(base, GUARDED_WRITE, { "x-api-key": "secret" })).status)
    }

    assert.deepEqual(statuses, [ 400, 400, 429, 429 ])
})))

test("failed key guesses count towards the write rate limit", () => withApiKey("secret", () => withServer({ writeLimit: 3 }, async (base) => {
    const statuses = []
    for (let i = 0; i < 5; i++) {
        statuses.push((await post(base, GUARDED_WRITE, { "x-api-key": `guess${i}` })).status)
    }

    assert.deepEqual(statuses, [ 401, 401, 401, 429, 429 ])
})))

test("read requests are rate limited too", () => withServer({ readLimit: 2 }, async (base) => {
    const statuses = []
    for (let i = 0; i < 3; i++) {
        statuses.push((await fetch(`${base}/api/players/abc`)).status)
    }

    assert.deepEqual(statuses, [ 400, 400, 429 ])
}))

test("ids must be plain integers in range", () => withServer({}, async (base) => {
    const rejected = [
        "/api/players/abc",
        "/api/players/1abc",
        "/api/players/-1",
        "/api/players/0",
        "/api/players/1.5",
        "/api/players/999999999",
        "/api/fpl/manager/1%2F..%2Fsecret",
        "/api/fpl/manager/1%3Fx%3Dy",
        "/api/fpl/manager-gameweek/123/39",
        "/api/fpl/manager-gameweek/123/0",
        "/api/fpl/player-gameweek/abc",
        "/api/training/abc/5",
        "/api/training/5/99"
    ]

    for (const path of rejected) {
        const response = await fetch(`${base}${path}`)

        assert.equal(response.status, 400, path)
    }
}))

test("the all-players limit comes from the query string and is bounded", () => withServer({}, async (base) => {
    for (const limit of [ "0", "101", "abc", "1.5", "-3" ]) {
        const response = await fetch(`${base}/api/fpl/all-players-gameweek?limit=${limit}`)

        assert.equal(response.status, 400, limit)
    }
}))

test("unknown routes return a JSON 404", () => withServer({}, async (base) => {
    const response = await fetch(`${base}/api/nope`)

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: "Route not found" })
}))

test("oversized request bodies are rejected", () => withApiKey("secret", () => withServer({}, async (base) => {
    const body = JSON.stringify({ filler: "x".repeat(200 * 1024) })

    const response = await post(base, GUARDED_WRITE, { "x-api-key": "secret" }, body)

    assert.equal(response.status, 413)
})))

test("security headers are set and the framework is not advertised", () => withServer({}, async (base) => {
    const response = await fetch(`${base}/api/players/abc`)

    assert.equal(response.headers.get("x-powered-by"), null)
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    assert.ok(response.headers.get("content-security-policy"))
}))

test("only configured origins get CORS access", () => withServer({}, async (base) => {
    const allowed = await fetch(`${base}/api/players/abc`, { headers: { origin: "http://localhost:5173" } })
    const other = await fetch(`${base}/api/players/abc`, { headers: { origin: "https://evil.example" } })

    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173")
    assert.equal(other.headers.get("access-control-allow-origin"), null)
}))
