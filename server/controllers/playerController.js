// playerController.js

const asyncHandler = require("express-async-handler")
const playerService = require("../services/playerService")

// Get all players
const getPlayers = asyncHandler(async (req, res) => {
    const players = await playerService.getPlayers()
    res.status(200).json({
        count: players.length,
        data: players
    })
})

// Get specified player
const getPlayer = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId)) {
        res.status(400)
        throw new Error("Invalid player ID")
    }

    const player = await playerService.getPlayer(playerId)
    if (!player) {
        res.status(404)
        throw new Error("Player not found")
    }

    res.status(200).json(player)
})

// Get player gameweeks
const getPlayerGameweeks = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId)) {
        res.status(400)
        throw new Error("Invalid player ID")
    }

    const player = await playerService.getPlayer(playerId)
    if (!player) {
        res.status(404)
        throw new Error("Player not found")
    }

    const gameweeks = await playerService.getPlayerGameweeks(playerId)
    
    res.status(200).json({ count: gameweeks.length, player, data: gameweeks })
})

// Get player seasons
const getPlayerSeasons = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId)) {
        res.status(400)
        throw new Error("Invalid player ID")
    }

    const player = await playerService.getPlayer(playerId)
    if (!player) {
        res.status(404)
        throw new Error("Player not found")
    }

    const seasons = await playerService.getPlayerSeasons(playerId)

    res.status(200).json({
        count: seasons.length,
        player,
        data: seasons
    })
})

// Get player fixtures
const getPlayerFixtures = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId)) {
        res.status(400)
        throw new Error("Invalid player ID")
    }

    const result = await playerService.getPlayerFixtures(playerId)
    if (!result) {
        res.status(404)
        throw new Error("Player not found")
    }

    res.status(200).json({
        count: result.fixtures.length,
        player: result.player,
        data: result.fixtures
    })
})

// Get player analysis
const getPlayerAnalysis = asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId)) {
        res.status(400)
        throw new Error("Invalid player ID")
    }

    const analysis = await playerService.getPlayerAnalysis(playerId)
    if (!analysis) {
        res.status(404)
        throw new Error("Player not found")
    }

    res.status(200).json(analysis)
})

module.exports = {
    getPlayers,
    getPlayer,
    getPlayerGameweeks,
    getPlayerSeasons,
    getPlayerFixtures,
    getPlayerAnalysis
}