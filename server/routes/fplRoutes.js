// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { getBootstrap, getFixtures, dataSync } = require("../controllers/fplController")

fplRouter.get("/bootstrap", getBootstrap)
fplRouter.get("/fixtures", getFixtures)
fplRouter.post("/sync", dataSync)

module.exports = { fplRouter }