// fplController.js

// Imports
const asyncHandler = require("express-async-handler")
const fplService = require("../services/fplService")
const fplSyncService = require("../services/fplSyncService")
const managerService = require("../services/managerService")

//--------------------------------------------------------//
//                      GET Routes                        //
//--------------------------------------------------------//

/**
 * @route   GET /api/fpl/bootstrap
 * @desc    Retrieve bootstrap data from fpl api
 */
const getBootstrap = asyncHandler(async (req, res) => {
    try {
        const data = await fplService.getBootstrap()
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching FPL bootstrap data: ", error.message)
        res.status(500).json({ message: "Failed to fetch FPL Bootstrap data" })
    }
})

/**
 * @route   GET /api/fpl/fixtures
 * @desc    Retrieve all fixtures from fpl api
 */
const getFixtures = asyncHandler(async (req, res) => {
    try {
        const data = await fplService.getFixtures()
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching FPL fixture data: ", error.message)
        res.status(500).json({ message: "Failed to fetch FPL Fixture data" })
    }
})

/**
 * @route    GET /api/fpl/manager/:managerId
 * @desc     Retrieve specified manager's data using managerId
 */
const getManager = asyncHandler(async (req, res) => {
    try {
        const { managerId } = req.params
        const data = await fplService.getManager(managerId)
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching manager: ", error.message)
        res.status(500).json({ message: "Failed to fetch manager data" })
    }
})

/**
 * @route   GET /api/fpl/manager-gameweek/:managerId
 * @desc    Retrieve specified manager's gameweek data using managerId 
 */
const getManagerGameweek = asyncHandler(async (req, res) => {
    try {
        const { managerId, gameweek } = req.params
        const data = await fplService.getManagerGameweek(managerId, gameweek)
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching manager gameweek data: ", error.message)
        res.status(500).json({ message: "Failed to fetch manager gameweek data" })
    }
})

/**
 * @route   GET /api/fpl/manager/:managerId/squad/:gameweek
 * @desc    Retrieve specified manager's squad for specified gameweek
 */
const getManagerSquad = asyncHandler(async (req, res) => {
    try {
        const { managerId, gameweek } = req.params
        const data = await managerService.getManagerSquad(managerId, gameweek)
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching manager squad data: ", error.message)
        res.status(500).json({ message: "Failed to fetch manager squad data" })
    }
})

/**
 * @route   GET /api/fpl/player-gameweek/:playerId
 * @desc    Retrieves specified player's gameweek data and history
 */
const getPlayerGameweek = asyncHandler(async (req, res) => {
    try {
        const { playerId } = req.params
        const data = await fplService.getPlayerGameweek(playerId)
        res.status(200).json(data)
    } catch (error) {
        console.error("Error fetching player gameweek data: ", error.message)
        res.status(500).json({ message: "Failed to fetch player gameweek data" })
    }
})

//--------------------------------------------------------//
//                      SYNC Routes                       //
//--------------------------------------------------------//

/**
 * @route   POST /api/fpl/sync-bootstrap
 * @desc    Sync player and team data to database
 */
const syncBootstrap = asyncHandler(async (req, res) => {
    try {
        const result = await fplSyncService.syncBootstrap()
        res.status(200).json({
            message: "FPL bootstrap data synced successfully",
            result
        })
    } catch (error) {
        console.error("Error syncing FPL bootstrap data: ", error.message)
        res.status(500).json({ message: "Failed to sync FPL bootstrap data" })
    }
}) 

/**
 * @route   POST /api/fpl/sync-fixtures
 * @desc    Sync fixtures data to database
 */
const syncFixtures = asyncHandler(async (req, res) => {
    try {
        const result = await fplSyncService.syncFixtures()
        res.status(200).json({
            message: "FPL fixture data synced successfully",
            result
        })
    } catch (error) {
        console.error("Error syncing FPL fixture data: ", error.message)
        res.status(500).json({ message: "Failed to sync FPL fixture data" })
    }
}) 

/**
 * @route   POST /api/fpl/sync-manager/:managerId
 * @desc    Sync manager data to database
 */
const syncManager = asyncHandler(async (req, res) => {
    try {
        const { managerId } = req.params
        const result = await fplSyncService.syncManager(managerId)
        res.status(200).json({
            message: "FPL Manager data synced successfully",
            result
        })
    } catch (error) {
        console.error("Error syncing manager data: ", error.message)
        res.status(500).json({ message: "Failed to sync manager data" })
    }
})

/**
 * @route   POST /api/fpl/sync-gameweek
 * @desc    Sync manager gameweek data to database
 */
const syncManagerGameweek = asyncHandler(async (req, res) => {
    try {
        const { managerId, gameweek } = req.params
        const result = await fplSyncService.syncManagerGameweek(managerId, gameweek)
        res.status(200).json({
            message: "FPL Manager Gameweek data synced successfully",
            result
        })
    } catch (error) {
        console.error("Error syncing manager gameweek data: ", error.message)
        res.status(500).json({ message: "Failed to sync manager gameweek data" })
    }
})

/**
 * @route   POST /api/fpl/sync-player-gameweek/:playerId
 * @desc    Sync specified player's gameweek data to database
 */
const syncPlayerGameweek = asyncHandler(
    async (req, res) => {
        try {
            const { playerId } = req.params
            const result = await fplSyncService.syncPlayerGameweek(playerId)
            res.status(200).json(result)
        } catch (error) {
            console.error("Error syncing player gameweek data: ", error.message)
            res.status(500).json({ message: "Failed to sync player gameweek data" })
        }
    }
)

module.exports = {
    getBootstrap,
    getFixtures,
    getManager,
    getManagerGameweek,
    getManagerSquad,
    getPlayerGameweek,
    
    syncBootstrap,
    syncFixtures,
    syncManager,
    syncManagerGameweek,
    syncPlayerGameweek
}