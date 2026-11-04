// teamController.js

const asyncHandler = require("express-async-handler")
const Team = require("../models/teamModel")

/**
 * @route   GET /api/teams
 * @desc    Club names, for filters and labels
 */
const getTeams = asyncHandler(async (req, res) => {
    const teams = await Team.find().select("fplId code name shortName").sort({ name: 1 }).lean()

    res.status(200).json(teams.map(({ fplId, code, name, shortName }) => ({ fplId, code, name, shortName })))
})

module.exports = { getTeams }
