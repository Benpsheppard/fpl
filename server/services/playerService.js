// playerService.js

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const Team = require("../models/teamModel")

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

// Get player analysis
const getPlayerAnalysis = async (playerId) => {
    // Get player
    const player = await Player.findOne({ fplId: playerId, removed: false }).lean()
    if (!player) {
        return null
    }

    // Get team
    const team = await Team.findOne({ fplId: player.team }).lean()

    // Get player gameweek, seasons and fixture data
    const gameweeks = await PlayerGameweek.find({ playerId: playerId })
        .sort({ gameweek: -1 })
        .lean()
    const seasons = await PlayerSeason.find({ playerId: playerId })
        .sort({ seasonName: -1 })
        .lean()
    const fixtures = await Fixture.find({ $or: [{ homeTeam: player.team }, { awayTeam: player.team }] })
        .sort({ gameweek: 1 })
        .lean()

    // Recent gameweeks
    const last5Gameweeks = gameweeks.slice(0, 5)
    const last10Gameweeks = gameweeks.slice(0, 10)

    // Recent form calculations
    const calculateForm = (weeks) => {
        if (weeks.length === 0) {
            return {
                gameweeks: 0,
                totalPoints: 0,
                averagePoints: 0,
                mintues: 0,
                pointsPer90: 0
            }
        }

        const totalPoints = weeks.reduce((sum, week) => sum + (week.totalPoints || 0), 0)
        const minutes = weeks.reduce((sum, week) => sum + (week.minutes || 0), 0)

        const averagePoints = totalPoints / weeks.length
        const pointsPer90 = minutes > 0 ? (totalPoints / minutes) * 90 : 0

        return {
            gameweeks: weeks.length,
            totalPoints,
            averagePoints: Number(averagePoints.toFixed(2)),
            minutes,
            pointsPer90: Number(pointsPer90.toFixed(2))
        }
    }

    // Underlying stats
    const calculateUnderlyingStats = (weeks) => {
        return {
            goals: weeks.reduce((sum, week) => sum + (week.goalsScored || 0), 0),
            assists: weeks.reduce((sum, week) => sum + (week.assists || 0), 0),

            xG: Number(weeks.reduce((sum, week) => sum + (week.expectedGoals || 0), 0).toFixed(2)),
            xA: Number(weeks.reduce((sum, week) => sum + (week.expectedAssists || 0), 0).toFixed(2)),
            xGI: Number(weeks.reduce((sum, week) => sum +(week.expectedGoalInvolvements || 0), 0).toFixed(2)),

            bonus: weeks.reduce((sum, week) => sum + (week.bonus || 0), 0),
            bps: weeks.reduce((sum, week) => sum + (week.bps || 0), 0)
        }
    }

    // Fixture Analysis
    const teamIds = fixtures.flatMap((fixture) => [fixture.homeTeam, fixture.awayTeam])
    const teams = await Team.find({ fplId: { $in: teamIds }}).lean()
    const teamMap = new Map(teams.map((team) => [team.fplId, team]))

    const now = new Date()
    const upcomingFixtures = fixtures
        .filter((fixture) => { return fixture.kickoffTime && new Date(fixture.kickoffTime) > now })
        .slice(0, 5)
        .map((fixture) => {
            const isHome = fixture.homeTeam === player.team
            
            const opponentTeamId = isHome ? fixture.awayTeam : fixture.homeTeam
            const opponent = teamMap.get(opponentTeamId)
            const difficulty = isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty

            return {
                fixtureId: fixture.fplId,
                gameweek: fixture.gameweek,
                opponent: opponent 
                ? {
                    fplId: opponent.fplId,
                    name: opponent.name,
                    shortName: opponent.shortName
                }
                : null,
                isHome,
                difficulty,
                kickoffTime: fixture.kickoffTime
            }
        })

    const fixtureDifficulties = upcomingFixtures.map((fixture) => fixture.difficulty)

    const averageDifficulty = fixtureDifficulties.length > 0
        ? fixtureDifficulties.reduce((sum, difficulty) => sum + difficulty, 0) / fixtureDifficulties.length
        : 0

    // Previous season Analysis
    const calculateHistoricalPerformance = (seasons) => {
        if (seasons.length === 0) {
            return {
                seasons: 0,
                totalPoints: 0,
                averagePoints: 0,
                minutes: 0,
                pointsPer90: 0,
                goals: 0,
                assists: 0,
                xG: 0,
                xA: 0,
                xGI: 0
            }
        }

        const totalPoints = seasons.reduce((sum, season) => sum + (season.totalPoints || 0), 0)
        const minutes = seasons.reduce((sum, season) => sum + (season.minutes || 0), 0)
        const goals = seasons.reduce((sum, season) => sum + (season.goalsScored || 0), 0)
        const assists = seasons.reduce((sum, season) => sum + (season.assists || 0), 0)
        const xG = seasons.reduce((sum, season) => sum + (season.expectedGoals || 0), 0)
        const xA = seasons.reduce((sum, season) => sum + (season.expectedAssists || 0), 0)
        const xGI = seasons.reduce((sum, season) => sum + (season.expectedGoalInvolvements || 0), 0)
        const averagePoints = totalPoints / seasons.length
        const pointsPer90 = minutes > 0 ? (totalPoints / minutes) * 90 : 0

        return {
            seasons: seasons.length,
            totalPoints,
            averagePoints: Number(averagePoints.toFixed(2)),
            minutes,
            pointsPer90: Number(pointsPer90.toFixed(2)),
            goals,
            assists,
            xG: Number(xG.toFixed(2)),
            xA: Number(xA.toFixed(2)),
            xGI: Number(xGI.toFixed(2))
        }
    }

    const historicalSeasons = seasons.map((season) => {
        const pointsPer90 = season.minutes > 0 ? (season.totalPoints / season.minutes) * 90 : 0

        return {
            ...season,
            pointsPer90: Number(pointsPer90.toFixed(2))
        }
    })

    return {
        player,
        recentForm: {
            last5Gameweeks: calculateForm(last5Gameweeks),
            last10Gameweeks: calculateForm(last10Gameweeks)
        },

        underlying: {
            last5Gameweeks: calculateUnderlyingStats(last5Gameweeks),
            last10Gameweeks: calculateUnderlyingStats(last10Gameweeks)
        },

        fixtures: {
            next5Fixtures: upcomingFixtures,
            averageDifficulty: Number(averageDifficulty.toFixed(2))
        },

        historical: {
            summary: calculateHistoricalPerformance(seasons),
            seasons: historicalSeasons
        }
    }
}

module.exports = {
    getPlayers,
    getPlayer,
    getPlayerGameweeks,
    getPlayerSeasons,
    getPlayerFixtures,
    getPlayerAnalysis
}