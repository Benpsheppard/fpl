// playerService.js

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")

// Get All Players
const getPlayers = async () => {
    return await Player.find({ removed: false })
        .sort({ name: 1 })
        .lean()
}

// Get Specified Player
const getPlayer = async (playerId) => {
    return await Player.findOne({
        fplId: playerId,
        removed: false
    }).lean()
}

// Get Player Gameweeks
const getPlayerGameweeks = async (playerId) => {
    return await PlayerGameweek.find({ playerId: playerId })
        .sort({ gameweek: 1 })
        .lean()
}

// Get Player Seasons
const getPlayerSeasons = async (playerId) => {
    return await PlayerSeason.find({ playerId: playerId })
        .sort({ seasonName: -1 })
        .lean()
}

// Get Player fixtures
const getPlayerFixtures = async (playerId) => {
    const player = await Player.findOne({ fplId: playerId, removed: false })
        .select("fplId name team")
        .lean()

    if (!player) {
        return null
    }

    const fixtures = await Fixture.find({
        $or: [
            { homeTeam: player.team },
            { awayTeam: player.team }
        ]
    })
    .sort({ gameweek: 1 })
    .lean()

    return {
        player,
        fixtures
    }
}

module.exports = {
    getPlayers,
    getPlayer,
    getPlayerGameweeks,
    getPlayerSeasons,
    getPlayerFixtures
}