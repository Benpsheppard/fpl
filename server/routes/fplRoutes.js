// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { getBootstrap, getFixtures } = require("../controllers/fplController")

fplRouter.get("/bootstrap", getBootstrap)
fplRouter.get("/fixtures", getFixtures)

module.exports = { fplRouter }