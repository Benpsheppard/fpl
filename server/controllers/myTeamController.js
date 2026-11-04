// myTeamController.js

const asyncHandler = require("express-async-handler")
const myTeamService = require("../services/myTeamService")

/**
 * @route   GET /api/my-team
 * @desc    The configured manager's current squad with sell prices and bank
 */
const getMyTeam = asyncHandler(async (req, res) => {
    const managerId = Number(process.env.MY_FPL_MANAGER_ID)

    if (!Number.isInteger(managerId) || managerId <= 0) {
        res.status(503).json({ message: "MY_FPL_MANAGER_ID is not configured on the server" })
        return
    }

    try {
        res.status(200).json(await myTeamService.getMyTeam(managerId))
    } catch (error) {
        if (error.response?.status === 404) {
            res.status(404).json({ message: "FPL has no manager with the configured MY_FPL_MANAGER_ID" })
            return
        }

        console.error("Error loading my team: ", error.message)
        res.status(502).json({ message: "Could not load the team from the FPL API" })
    }
})

module.exports = { getMyTeam }
