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
    const lastGameweek = gameweeks.slice(0, 1)
    const last3Gameweeks = gameweeks.slice(0, 3)
    const last5Gameweeks = gameweeks.slice(0, 5)
    const last10Gameweeks = gameweeks.slice(0, 10)

    // Availability
    const availability = calculateAvailability(player, last5Gameweeks, last10Gameweeks)

    // Fixture Analysis
    const fixtureAnalysis = await calculateFixtureAnalysis(player.team, fixtures)

    // Historical seasons Analysis
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
            lastGameweek: calculateForm(lastGameweek),
            last3Gameweeks: calculateForm(last3Gameweeks),
            last5Gameweeks: calculateForm(last5Gameweeks),
            last10Gameweeks: calculateForm(last10Gameweeks)
        },

        underlying: {
            lastGameweek: calculateUnderlyingStats(lastGameweek),
            last3Gameweeks: calculateUnderlyingStats(last3Gameweeks),
            last5Gameweeks: calculateUnderlyingStats(last5Gameweeks),
            last10Gameweeks: calculateUnderlyingStats(last10Gameweeks)
        },

        availability,

        fixtures: fixtureAnalysis,

        historical: {
            summary: calculateHistoricalPerformance(seasons),
            seasons: historicalSeasons
        }
    }
}

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
    const minutes = weeks.reduce((sum, week) => sum + (week.minutes || 0), 0)

    const goals = weeks.reduce((sum, week) => sum + (week.goalsScored || 0), 0)
    const assists = weeks.reduce((sum, week) => sum + (week.assists || 0), 0)
    
    const xG = Number(weeks.reduce((sum, week) => sum + (week.expectedGoals || 0), 0).toFixed(2))
    const xA = Number(weeks.reduce((sum, week) => sum + (week.expectedAssists || 0), 0).toFixed(2))
    const xGI = Number(weeks.reduce((sum, week) => sum +(week.expectedGoalInvolvements || 0), 0).toFixed(2))

    const goalsPer90 = minutes > 0 ? Number(((goals / minutes) * 90).toFixed(2)) : 0
    const assistsPer90 = minutes > 0 ? Number(((assists / minutes) * 90).toFixed(2)) : 0

    const xGPer90 = minutes > 0 ? Number(((xG / minutes) * 90).toFixed(2)) : 0
    const xAPer90 = minutes > 0 ? Number(((xA / minutes) * 90).toFixed(2)) : 0
    const xGIPer90 = minutes > 0 ? Number(((xGI / minutes) * 90).toFixed(2)) : 0

    return {
        goals,
        assists,
        xG,
        xA,
        xGI,

        goalsPer90,
        assistsPer90,
        xGPer90,
        xAPer90,
        xGIPer90,

        bonus: weeks.reduce((sum, week) => sum + (week.bonus || 0), 0),
        bps: weeks.reduce((sum, week) => sum + (week.bps || 0), 0)
    }
}

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

// Availability Analysis
const calculateAvailability = (player, last5, last10) => {
    const minutesLast5 = last5.reduce((sum, gameweek) => sum + (gameweek.minutes || 0), 0)
    const minutesLast10 = last10.reduce((sum, gameweek) => sum + (gameweek.minutes || 0), 0)

    const appearancesLast5 = last5.filter((gameweek) => (gameweek.minutes || 0) > 0).length
    const appearancesLast10 = last10.filter((gameweek) => (gameweek.minutes || 0) > 0).length

    const startsLast5 = last5.reduce((sum, gameweek) => sum + (gameweek.starts || 0), 0)
    const startsLast10 = last10.reduce((sum, gameweek) => sum + (gameweek.starts || 0), 0)

    const minutesPerGameLast5 = last5.length > 0 ? Number((minutesLast5 / last5.length).toFixed(2)) : 0
    const minutesPerGameLast10 = last10.length > 0 ? Number((minutesLast10 / last10.length).toFixed(2)) : 0

    const appearanceRateLast5 = last5.length > 0 ? Number(((appearancesLast5 / last5.length) * 100).toFixed(2)) : 0
    const appearanceRateLast10 = last10.length > 0 ? Number(((appearancesLast10 / last10.length) * 100).toFixed(2)) : 0

    const startRateLast5 = last5.length > 0 ? Number(((startsLast5 / last5.length) * 100).toFixed(2)) : 0
    const startRateLast10 = last10.length > 0 ? Number(((startsLast10 / last10.length) * 100).toFixed(2)) : 0

    return {
        status: player.status,

        chanceOfPlayingThisRound: player.chanceOfPlayingThisRound,
        chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,

        minutesLast5,
        minutesLast10,

        appearancesLast5,
        appearancesLast10,

        startsLast5,
        startsLast10,

        minutesPerGameLast5,
        minutesPerGameLast10,

        appearanceRateLast5,
        appearanceRateLast10,

        startRateLast5,
        startRateLast10
    }
}

// Fixture Analysis
const calculateFixtureAnalysis = async (playerTeamId, fixtures) => {
    // Fixture Analysis
    const teamIds = fixtures.flatMap((fixture) => [fixture.homeTeam, fixture.awayTeam])
    const teams = await Team.find({ fplId: { $in: teamIds }}).lean()
    const teamMap = new Map(teams.map((team) => [team.fplId, team]))

    const now = new Date()
    const upcomingFixtures = fixtures
        .filter((fixture) => { return fixture.kickoffTime && new Date(fixture.kickoffTime) > now })
        .sort((a, b) => { return new Date(a.kickoffTime) - new Date(b.kickoffTime) })
        .map((fixture) => {
            const isHome = fixture.homeTeam === playerTeamId
            
            const opponentTeamId = isHome ? fixture.awayTeam : fixture.homeTeam
            const opponent = teamMap.get(opponentTeamId)
            const difficulty = Number(isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty)

            return {
                fixtureId: fixture.fplId,
                gameweek: fixture.gameweek,

                opponent: opponent 
                    ? {
                        fplId: opponent.fplId,
                        name: opponent.name,
                        shortName: opponent.shortName,

                        strengthOverall: isHome ? opponent.strengthOverallAway : opponent.strengthOverallHome,
                    }
                    : null,

                isHome,
                difficulty,
                kickoffTime: fixture.kickoffTime
            }
        })

    const next5Fixtures = upcomingFixtures.slice(0, 5)

    const fixturesNext7Days = upcomingFixtures.filter((fixture) => {
        const kickoff = new Date(fixture.kickoffTime)

        const difference = kickoff - now
        const daysUntilFixture = difference / (1000 * 60 * 60 * 24)

        return daysUntilFixture <= 7
    }).length
    const fixturesNext14Days = upcomingFixtures.filter((fixture) => {
        const kickoff = new Date(fixture.kickoffTime)

        const difference = kickoff - now
        const daysUntilFixture = difference / (1000 * 60 * 60 * 24)

        return daysUntilFixture <= 14
    }).length
    const fixturesNext21Days = upcomingFixtures.filter((fixture) => {
        const kickoff = new Date(fixture.kickoffTime)

        const difference = kickoff - now
        const daysUntilFixture = difference / (1000 * 60 * 60 * 24)

        return daysUntilFixture <= 21
    }).length

    const fixtureDifficulties = next5Fixtures.map((fixture) => fixture.difficulty)
    const averageDifficulty = fixtureDifficulties.length > 0
        ? Number((fixtureDifficulties.reduce((sum, difficulty) => sum + difficulty, 0) / fixtureDifficulties.length).toFixed(2))
        : 0

    const easyFixtures = next5Fixtures.filter((fixture) => fixture.difficulty <= 2).length
    const mediumFixtures = next5Fixtures.filter((fixture) => fixture.difficulty === 3).length
    const hardFixtures = next5Fixtures.filter((fixture) => fixture.difficulty >= 4).length

    const homeFixtures = next5Fixtures.filter((fixture) => fixture.isHome).length
    const awayFixtures = next5Fixtures.filter((fixture) => !fixture.isHome).length

    const fixturesWithSpacing = next5Fixtures.map((fixture, index) => {
        if (index === 0) {
            return {
                ...fixture,
                daysBetweenFixtures: null
            }
        }

        const previousKickoff = new Date(next5Fixtures[index - 1].kickoffTime)
        const currentKickoff = new Date(fixture.kickoffTime)

        const difference = currentKickoff - previousKickoff
        const daysBetweenFixtures = Number((difference / (1000 * 60 * 60 * 24)).toFixed(2))

        return {
            ...fixture,
            daysBetweenFixtures
        }
    })

    const spacingPeriods = fixturesWithSpacing
        .map((fixture) => fixture.daysBetweenFixtures)
        .filter((days) => days !== null)

    const averageDaysBetweenFixtures = spacingPeriods.length > 0
        ? spacingPeriods.reduce((sum, days) => sum + days, 0) / spacingPeriods.length : 0

    return {
        next5Fixtures: fixturesWithSpacing,

        summary: {
            averageDifficulty,

            easyFixtures,
            mediumFixtures,
            hardFixtures,

            homeFixtures,
            awayFixtures,

            averageDaysBetweenFixtures: Number(averageDaysBetweenFixtures.toFixed(2)),

            fixturesNext7Days,
            fixturesNext14Days,
            fixturesNext21Days
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