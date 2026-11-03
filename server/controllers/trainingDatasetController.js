// trainingDatasetController.js

const asyncHandler = require('express-async-handler')
const trainingDatasetService = require('../services/trainingDatasetService')

const buildTrainingRow = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    const gameweek = Number(req.params.gameweek)

    if (!Number.isInteger(playerId) || playerId <= 0 || !Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
        res.status(400).json({ message: "playerId and gameweek must be positive integers (gameweek 1-38)" })
        return
    }

    const training = await trainingDatasetService.buildTrainingRow(playerId, gameweek)

    res.status(200).json(training)
})

const buildTrainingDataset = asyncHandler(async (req, res) => {
    let maxGameweek

    if (req.query.maxGameweek !== undefined) {
        maxGameweek = Number(req.query.maxGameweek)

        if (!Number.isInteger(maxGameweek) || maxGameweek < 1 || maxGameweek > 38) {
            res.status(400).json({ message: "maxGameweek must be an integer from 1 to 38" })
            return
        }
    }

    const dataset = await trainingDatasetService.getTrainingDataset({ maxGameweek })

    res.status(200).json({
        rows: dataset.length,
        dataset
    })
})

module.exports = {
    buildTrainingRow,
    buildTrainingDataset
}