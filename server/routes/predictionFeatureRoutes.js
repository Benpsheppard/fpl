// predictionFeatureRoutes.js

const express = require('express')

const predictionFeatureRouter = express.Router()

const { getPredictionFeatures } = require("../controllers/predictionFeatureController")

// Routes
predictionFeatureRouter.get("/", getPredictionFeatures)

module.exports = { predictionFeatureRouter }