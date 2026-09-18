// trainingDatasetController.js

const asyncHandler = require('express-async-handler')
const trainingDatasetService = require('../services/trainingDatasetService')

const buildTrainingRow = asyncHandler(async (req, res) => {
    const { playerId, gameweek } = req.params
    const training = await trainingDatasetService.buildTrainingRow(Number(playerId), Number(gameweek))

    res.status(200).json(training)
})

const buildTrainingDataset = asyncHandler(async (req, res) => {
    const dataset = await trainingDatasetService.buildTrainingDataset()

    res.status(200).json({
        rows: dataset.length,
        dataset
    })
})

module.exports = {
    buildTrainingRow,
    buildTrainingDataset
}