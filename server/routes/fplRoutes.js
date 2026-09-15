// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { getBootstrap, getFixtures, getManager, syncBootstrap, syncFixtures, syncManager } = require("../controllers/fplController")

// Get routes
fplRouter.get("/bootstrap", getBootstrap)
fplRouter.get("/fixtures", getFixtures)
fplRouter.get("/manager/:managerId", getManager)

// Sync routes
fplRouter.post("/sync-bootstrap", syncBootstrap)
fplRouter.post("/sync-fixtures", syncFixtures)
fplRouter.post("/sync-manager/:managerId", syncManager)

module.exports = { fplRouter }