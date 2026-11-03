// httpRetry.js

const axios = require("axios")

const RETRYABLE_STATUS = (status) => status === 429 || status >= 500

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Seconds or an HTTP date, as sent in a Retry-After header
const parseRetryAfter = (value) => {
    if (!value) {
        return null
    }

    const seconds = Number(value)
    if (Number.isFinite(seconds)) {
        return seconds * 1000
    }

    const date = Date.parse(value)
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

// GET with a timeout, retrying rate limits (429), server errors (5xx) and
// network failures with exponential backoff. Other 4xx errors fail at once.
const getWithRetry = async (url, {
    retries = 4,
    baseDelayMs = 500,
    maxDelayMs = 10000,
    timeout = 15000,
    get = axios.get,
    sleep = defaultSleep
} = {}) => {
    for (let attempt = 0; ; attempt++) {
        try {
            return await get(url, { timeout })
        } catch (error) {
            const status = error.response?.status
            const retryable = status === undefined || RETRYABLE_STATUS(status)

            if (!retryable || attempt >= retries) {
                throw error
            }

            const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
            const retryAfter = parseRetryAfter(error.response?.headers?.["retry-after"])

            await sleep(Math.min(Math.max(backoff, retryAfter ?? 0), maxDelayMs))
        }
    }
}

module.exports = { getWithRetry }
