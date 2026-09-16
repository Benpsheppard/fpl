// playerRoutes.js

// Imports
const express = require('express')

const playerRouter = express.Router()

const { getPlayers, getPlayer, getPlayerGameweeks, getPlayerSeasons, getPlayerFixtures, getPlayerAnalysis } = require('../controllers/playerController')

// Routes
playerRouter.get("/", getPlayers)
playerRouter.get("/:playerId", getPlayer)
playerRouter.get("/:playerId/gameweeks", getPlayerGameweeks)
playerRouter.get("/:playerId/seasons", getPlayerSeasons)
playerRouter.get("/:playerId/fixtures", getPlayerFixtures)
playerRouter.get("/:playerId/analysis", getPlayerAnalysis)

module.exports = { playerRouter }