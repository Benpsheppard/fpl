// fplRoutes.js

// Imports
const express = require('express')

const fplRouter = express.Router()

const { getBootstrap } = require("../controllers/fplController")

fplRouter.get("/bootstrap", getBootstrap)

module.exports = { fplRouter }