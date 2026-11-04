// app.js
//
// Builds the Express app without connecting to the database or listening, so
// tests can start it on any port.

const express = require("express")
const helmet = require("helmet")
const cors = require("cors")
const { rateLimit } = require("express-rate-limit")

const { fplRouter } = require("./routes/fplRoutes")
const { playerRouter } = require("./routes/playerRoutes.js")
const { predictionFeatureRouter } = require("./routes/predictionFeatureRoutes.js")
const { trainingDatasetRouter } = require("./routes/trainingDatasetRoutes.js")
const { myTeamRouter } = require("./routes/myTeamRoutes.js")
const { teamRouter } = require("./routes/teamRoutes.js")

const { requireApiKeyForWrites } = require("./middleware/requireApiKey")
const { notFound, errorHandler } = require("./middleware/errorHandler")

const DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"

const limiter = (limit, message) => rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message }
})

const createApp = ({ readLimit = 300, writeLimit = 10 } = {}) => {
    const app = express()

    const allowedOrigins = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS)
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)

    app.use(helmet())
    app.use(cors({ origin: allowedOrigins }))
    app.use(express.json({ limit: "100kb" }))
    app.use(express.urlencoded({ extended: false, limit: "100kb" }))

    // Every non-read request is limited tightly and needs the API key, so a new
    // POST route is protected by default rather than by remembering to add it
    app.use("/api", limiter(readLimit, "Too many requests, slow down"))

    const writeRateLimiter = limiter(writeLimit, "Too many write requests, slow down")
    app.use("/api", (req, res, next) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
            next()
            return
        }

        writeRateLimiter(req, res, next)
    })
    app.use("/api", requireApiKeyForWrites)

    app.use("/api/fpl", fplRouter)
    app.use("/api/players", playerRouter)
    app.use("/api/prediction", predictionFeatureRouter)
    app.use("/api/training", trainingDatasetRouter)
    app.use("/api/my-team", myTeamRouter)
    app.use("/api/teams", teamRouter)

    app.use(notFound)
    app.use(errorHandler)

    return app
}

module.exports = { createApp }
