// requireApiKey.js

const crypto = require("node:crypto")

// Compare hashes so the check takes the same time wherever the keys differ
const matches = (provided, expected) => {
    const a = crypto.createHash("sha256").update(String(provided)).digest()
    const b = crypto.createHash("sha256").update(String(expected)).digest()

    return crypto.timingSafeEqual(a, b)
}

// Routes that change data (sync, anything that is not a read) need the API key in
// an x-api-key header. With no API_KEY configured they stay closed rather than open.
const requireApiKey = (req, res, next) => {
    const expected = process.env.API_KEY

    if (!expected) {
        res.status(503).json({ message: "API_KEY is not configured on the server" })
        return
    }

    const provided = req.get("x-api-key")

    if (!provided || !matches(provided, expected)) {
        res.status(401).json({ message: "Missing or invalid API key" })
        return
    }

    next()
}

const READ_METHODS = new Set([ "GET", "HEAD", "OPTIONS" ])

const requireApiKeyForWrites = (req, res, next) => {
    if (READ_METHODS.has(req.method)) {
        next()
        return
    }

    requireApiKey(req, res, next)
}

module.exports = { requireApiKey, requireApiKeyForWrites }
