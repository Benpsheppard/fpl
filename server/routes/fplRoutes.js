// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { 
    getBootstrap, getFixtures, getManager, getManagerGameweek, getManagerSquad,
    syncBootstrap, syncFixtures, syncManager, syncManagerGameweek 
} = require("../controllers/fplController")

// Get routes
fplRouter.get("/bootstrap", getBootstrap)
fplRouter.get("/fixtures", getFixtures)
fplRouter.get("/manager/:managerId", getManager)
fplRouter.get("/manager-gameweek/:managerId/:gameweek", getManagerGameweek)
fplRouter.get("/manager/:managerId/squad/:gameweek", getManagerSquad)

// Sync routes
fplRouter.post("/sync-bootstrap", syncBootstrap)
fplRouter.post("/sync-fixtures", syncFixtures)
fplRouter.post("/sync-manager/:managerId", syncManager)
fplRouter.post("/sync-gameweek/:managerId/:gameweek", syncManagerGameweek)

module.exports = { fplRouter }