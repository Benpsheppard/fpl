// teamRoutes.js

const express = require("express")

const teamRouter = express.Router()

const { getTeams } = require("../controllers/teamController")

teamRouter.get("/", getTeams)

module.exports = { teamRouter }
