// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { getBootstrap, getFixtures, syncBootstrap, syncFixtures } = require("../controllers/fplController")

fplRouter.get("/bootstrap", getBootstrap)
fplRouter.get("/fixtures", getFixtures)
fplRouter.post("/sync-bootstrap", syncBootstrap)
fplRouter.post("/sync-fixtures", syncFixtures)

module.exports = { fplRouter }