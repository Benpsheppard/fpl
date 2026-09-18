// trainingDatasetRoutes.js

const express = require('express')

const trainingDatasetRouter = express.Router()

const { buildTrainingRow, buildTrainingDataset } = require("../controllers/trainingDatasetController")

// Routes
trainingDatasetRouter.get("/:playerId/:gameweek", buildTrainingRow)
trainingDatasetRouter.get( "/dataset", buildTrainingDataset )

module.exports = { trainingDatasetRouter }