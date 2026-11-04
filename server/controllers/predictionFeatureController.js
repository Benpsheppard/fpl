// predictionFeatureController.js

const asyncHandler = require('express-async-handler')
const predictionFeatureService = require('../services/predictionFeatureService')

const getPredictionFeatures = asyncHandler(async (req, res) => {
    const playerId = Number(req.query.playerId)

    if (!Number.isInteger(playerId) || playerId <= 0) {
        res.status(400).json({ message: "playerId query parameter must be a positive integer" })
        return
    }

    const predictionFeatures = await predictionFeatureService.getPredictionFeatures(playerId)

    if (!predictionFeatures) {
        res.status(404).json({ message: "No prediction features available for this player" })
        return
    }

    res.status(200).json(predictionFeatures)
})

const getAllPredictionFeatures = asyncHandler(async (req, res) => {
    // How many gameweeks ahead to build rows for. 1 is the next gameweek only.
    let horizon = 1

    if (req.query.horizon !== undefined) {
        horizon = Number(req.query.horizon)

        if (!Number.isInteger(horizon) || horizon < 1 || horizon > 5) {
            res.status(400).json({ message: "horizon must be an integer from 1 to 5" })
            return
        }
    }

    res.status(200).json(await predictionFeatureService.getAllPredictionFeatures({ horizon }))
})

module.exports = {
    getPredictionFeatures,
    getAllPredictionFeatures
}
