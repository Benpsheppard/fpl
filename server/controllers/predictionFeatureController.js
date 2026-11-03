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

module.exports = {
    getPredictionFeatures
}
