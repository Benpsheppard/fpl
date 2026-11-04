// myTeamRoutes.js

const express = require("express")

const myTeamRouter = express.Router()

const { getMyTeam } = require("../controllers/myTeamController")

myTeamRouter.get("/", getMyTeam)

module.exports = { myTeamRouter }
