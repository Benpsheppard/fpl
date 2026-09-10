// fplController.js

// Imports
const asyncHandler = require("express-async-handler")
const fplService = require("../services/fplService")

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

module.exports = {
    getBootstrap,
    getFixtures
}