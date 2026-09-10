// fplService.js

// Imports
const axios = require("axios")

const FPL_API_URL = process.env.FPL_API_URL

// Get bootstrap data
const getBootstrap = async () => {
    const response = await axios.get(`${FPL_API_URL}/bootstrap-static/`)

    return response.data
}

// Get all fixtures
const getFixtures = async () => {
    const response = await axios.get(`${FPL_API_URL}/fixtures`)

    return response.data
}

module.exports = {
    getBootstrap,
    getFixtures
}