// predictionFeatureController.js

const asyncHandler = require('express-async-handler')
const predictionFeatureService = require('../services/predictionFeatureService')

const getPredictionFeatures = asyncHandler(async (req, res) => {
    const playerId = req.body.playerId
    const predictionFeatures = await predictionFeatureService.getPredictionFeatures(playerId)

    res.status(200).json(predictionFeatures)
})

module.exports = {
    getPredictionFeatures
}