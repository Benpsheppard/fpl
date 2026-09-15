// fplController.js

// Imports
const asyncHandler = require("express-async-handler")
const fplService = require("../services/fplService")
const fplSyncService = require("../services/fplSyncService")

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

module.exports = {
    getBootstrap,
    getFixtures,
    syncBootstrap,
    syncFixtures
}