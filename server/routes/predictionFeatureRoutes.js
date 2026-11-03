// predictionFeatureRoutes.js

const express = require('express')

const predictionFeatureRouter = express.Router()

const { getPredictionFeatures, getAllPredictionFeatures } = require("../controllers/predictionFeatureController")

// Routes
predictionFeatureRouter.get("/", getPredictionFeatures)
predictionFeatureRouter.get("/all", getAllPredictionFeatures)

module.exports = { predictionFeatureRouter }