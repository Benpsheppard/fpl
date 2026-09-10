// fplService.js

// Imports
const axios = require("axios")

const FPL_API_URL = "https://fantasy.premierleague.com/api"

const getBootstrap = async () => {
    const response = await axios.get(`${FPL_API_URL}/bootstrap-static/`)

    return response.data
}

module.exports = {
    getBootstrap
}