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

// Get manager data
const getManager = async (managerId) => {
    const response = await axios.get(`${FPL_API_URL}/entry/${managerId}`)

    return response.data
}

// Get manager gameweek data
const getManagerGameweek = async (managerId, gameweek) => {
    const response = await axios.get(`${FPL_API_URL}/entry/${managerId}/event/${gameweek}/picks`)

    return response.data
}

// Get player gameweek data
const getPlayerGameweek = async (playerId) => {
    const response = await axios.get(`${FPL_API_URL}/element-summary/${playerId}`)

    return response.data
}

module.exports = {
    getBootstrap,
    getFixtures,
    getManager,
    getManagerGameweek,
    getPlayerGameweek
}