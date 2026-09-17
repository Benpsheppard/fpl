// predictionFeatureService.js

const PlayerGameweek = require("../models/playerGameweekModel")
const Player = require("../models/playerModel")
const Fixture = require("../models/fixtureModel")
const Team = require("../models/teamModel")
const PlayerSeason = require("../models/playerSeasonModel")

const calculateWindow = (window) => {
    const minutes = window.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )
    const totalPoints = window.reduce( (sum, gameweek) => sum + (gameweek.totalPoints || 0), 0 )

    const goals = window.reduce( (sum, gameweek) => sum + (gameweek.goalsScored || 0), 0 )
    const assists = window.reduce( (sum, gameweek) => sum + (gameweek.assists || 0), 0 )

    const xG = Number( window .reduce((sum, gameweek) => sum + (gameweek.expectedGoals || 0), 0) .toFixed(2) )
    const xA = Number( window .reduce((sum, gameweek) => sum + (gameweek.expectedAssists || 0), 0) .toFixed(2) )
    const xGI = Number( window .reduce((sum, gameweek) => sum + (gameweek.expectedGoalInvolvements || 0), 0) .toFixed(2) )

    const starts = window.reduce( (sum, gameweek) => sum + (gameweek.starts || 0), 0 )
    const appearances = window.filter( (gameweek) => (gameweek.minutes || 0) > 0 ).length

    const pointsPer90 = minutes > 0 ? Number(((totalPoints / minutes) * 90).toFixed(2)) : 0

    const goalsPer90 = minutes > 0 ? Number(((goals / minutes) * 90).toFixed(2)) : 0
    const assistsPer90 = minutes > 0 ? Number(((assists / minutes) * 90).toFixed(2)) : 0

    const xGPer90 = minutes > 0 ? Number(((xG / minutes) * 90).toFixed(2)) : 0
    const xAPer90 = minutes > 0 ? Number(((xA / minutes) * 90).toFixed(2)) : 0
    const xGIPer90 = minutes > 0 ? Number(((xGI / minutes) * 90).toFixed(2)) : 0

    const startRate = window.length > 0 ? Number(((starts / window.length) * 100).toFixed(2)) : 0
    const appearanceRate = window.length > 0 ? Number(((appearances / window.length) * 100).toFixed(2)) : 0

    return {
        gameweeks: window.length,

        totalPoints,
        minutes,

        goals,
        assists,
        xG,
        xA,
        xGI,

        starts,
        appearances,

        pointsPer90,
        goalsPer90,
        assistsPer90,
        xGPer90,
        xAPer90,
        xGIPer90,

        startRate,
        appearanceRate
    }
}

const calculateAvailabilityFeatures = (player, last, last3, last5, last10) => {
    const calculateAvailabilityWindow = (window) => {
        const minutes = window.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )
        const minutesPerGame = window.length > 0 ? Number((minutes / window.length).toFixed(2)) : 0

        const starts = window.reduce( (sum, gameweek) => sum + (gameweek.starts || 0), 0 )
        const appearances = window.filter( (gameweek) => (gameweek.minutes || 0) > 0 ).length

        const startRate = window.length > 0 ? Number(((starts / window.length) * 100).toFixed(2)) : 0
        const appearanceRate = window.length > 0 ? Number(((appearances / window.length) * 100).toFixed(2)) : 0

        return {
            gameweeks: window.length,
            minutes,
            starts,
            appearances,
            minutesPerGame,
            startRate,
            appearanceRate
        }
    }

    return {
        status: player.status,

        chanceOfPlayingThisRound: player.chanceOfPlayingThisRound,
        chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,

        lastGameweek: calculateAvailabilityWindow(last),
        last3Gameweeks: calculateAvailabilityWindow(last3),
        last5Gameweeks: calculateAvailabilityWindow(last5),
        last10Gameweeks: calculateAvailabilityWindow(last10)
    }
}

const calculateFixtureFeatures = async (playerTeamId) => {
    const fixtures = await Fixture.find({ $or: [{ homeTeam: playerTeamId }, { awayTeam: playerTeamId }] })
        .sort({ kickoffTime: 1 })
        .lean()

    const now = new Date()
    const upcomingFixtures = fixtures
        .filter((fixture) => {
            return fixture.kickoffTime && new Date(fixture.kickoffTime) > now
        })

    if (upcomingFixtures.length === 0) {
        return {
            next5: {
                averageDifficulty: 0,
                easyFixtures: 0,
                mediumFixtures: 0,
                hardFixtures: 0,
                homeFixtures: 0,
                awayFixtures: 0
            },
            congestion: {
                fixturesNext7Days: 0,
                fixturesNext14Days: 0,
                fixturesNext21Days: 0
            },
            nextFixture: null,
            averageDaysBetweenFixtures: 0
        }
    }

    const teamIds = upcomingFixtures.flatMap((fixture) => [ fixture.homeTeam, fixture.awayTeam ])
    const teams = await Team.find({ fplId: { $in: teamIds } }).lean()
    const teamMap = new Map(teams.map((team) => [team.fplId, team]))

    const fixtureFeatures = upcomingFixtures.map((fixture) => {
        const isHome = fixture.homeTeam === playerTeamId

        const opponentTeamId = isHome ? fixture.awayTeam : fixture.homeTeam
        const opponent = teamMap.get(opponentTeamId)
        
        const difficulty = Number(isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty)

        const opponentStrength = opponent ? Number(isHome ? opponent.strengthOverallAway : opponent.strengthOverallHome) : 0

        return {
            fixtureId: fixture.fplId,
            gameweek: fixture.gameweek,
            isHome,
            difficulty,
            opponentStrength,
            kickoffTime: fixture.kickoffTime
        }
    })

    const next5Fixtures = fixtureFeatures.slice(0, 5)
    const fixtureDifficulties = next5Fixtures.map((fixture) => fixture.difficulty)
    const averageDifficulty = fixtureDifficulties.length > 0 
        ? Number((fixtureDifficulties.reduce((sum, difficulty) => sum + difficulty, 0) / fixtureDifficulties.length).toFixed(2))
        : 0
    
    const easyFixtures = next5Fixtures.filter((fixture) => fixture.difficulty <= 2).length
    const mediumFixtures = next5Fixtures.filter((fixture) => fixture.difficulty === 3).length
    const hardFixtures = next5Fixtures.filter((fixture) => fixture.difficulty >= 4).length

    const homeFixtures = next5Fixtures.filter((fixture) => fixture.isHome).length
    const awayFixtures = next5Fixtures.filter((fixture) => !fixture.isHome).length

    const calculateFixturesWithinDays = (days) => {
        return upcomingFixtures.filter((fixture) => {
            const kickoff = new Date(fixture.kickoffTime)

            const difference = kickoff - now

            const daysUntilFixture = difference / (1000 * 60 * 60 * 24)

            return daysUntilFixture <= days
        }).length
    }

    const spacingPeriods = []
    for (let i = 1; i < next5Fixtures.length; i++) {
        const previousKickoff = new Date(next5Fixtures[i - 1].kickoffTime)
        const currentKickoff = new Date(next5Fixtures[i].kickoffTime)

        const difference = currentKickoff - previousKickoff
        const daysBetween = difference / (1000 * 60 * 60 * 24)

        spacingPeriods.push(daysBetween)
    }

    const averageDaysBetweenFixtures = spacingPeriods.length > 0
        ? Number((spacingPeriods.reduce((sum, days) => sum + days, 0) / spacingPeriods.length).toFixed(2))
        : 0

    const nextFixture = next5Fixtures[0]

    return {
        next5: {
            averageDifficulty,

            easyFixtures,
            mediumFixtures,
            hardFixtures,

            homeFixtures,
            awayFixtures
        },

        congestion: {
            fixturesNext7Days: calculateFixturesWithinDays(7),
            fixturesNext14Days: calculateFixturesWithinDays(14),
            fixturesNext21Days: calculateFixturesWithinDays(21)
        },

        nextFixture: nextFixture
            ? {
                gameweek: nextFixture.gameweek,
                isHome: nextFixture.isHome,
                difficulty: nextFixture.difficulty,
                opponentStrength: nextFixture.opponentStrength
            }
            : null,

        averageDaysBetweenFixtures
    }
}

const calculateHistoricalFeatures = async (playerId) => {
    const seasons = await PlayerSeason.find({
        playerId: playerId
    })
        .sort({ seasonName: -1 })
        .lean()

    if (seasons.length === 0) {
        return {
            seasons: 0,
            totalPoints: 0,
            minutes: 0,
            goals: 0,
            assists: 0,
            xG: 0,
            xA: 0,
            xGI: 0,
            pointsPer90: 0,
            goalsPer90: 0,
            assistsPer90: 0,
            xGPer90: 0,
            xAPer90: 0,
            xGIPer90: 0
        }
    }

    const totalPoints = seasons.reduce( (sum, season) => sum + (season.totalPoints || 0), 0 )
    const minutes = seasons.reduce( (sum, season) => sum + (season.minutes || 0), 0 )

    const goals = seasons.reduce( (sum, season) => sum + (season.goalsScored || 0), 0 )
    const assists = seasons.reduce( (sum, season) => sum + (season.assists || 0), 0 )

    const xG = seasons.reduce( (sum, season) => sum + (season.expectedGoals || 0), 0 )
    const xA = seasons.reduce( (sum, season) => sum + (season.expectedAssists || 0), 0 )
    const xGI = seasons.reduce( (sum, season) => sum + (season.expectedGoalInvolvements || 0), 0 )

    const pointsPer90 = minutes > 0 ? Number(((totalPoints / minutes) * 90).toFixed(2)) : 0

    const goalsPer90 = minutes > 0 ? Number(((goals / minutes) * 90).toFixed(2)) : 0
    const assistsPer90 = minutes > 0 ? Number(((assists / minutes) * 90).toFixed(2)) : 0
    
    const xGPer90 = minutes > 0 ? Number(((xG / minutes) * 90).toFixed(2)) : 0
    const xAPer90 = minutes > 0 ? Number(((xA / minutes) * 90).toFixed(2)) : 0
    const xGIPer90 = minutes > 0 ? Number(((xGI / minutes) * 90).toFixed(2)) : 0

    return {
        seasons: seasons.length,
        totalPoints,

        minutes,

        goals,
        assists,

        xG: Number(xG.toFixed(2)),
        xA: Number(xA.toFixed(2)),
        xGI: Number(xGI.toFixed(2)),

        pointsPer90,
        goalsPer90,
        assistsPer90,

        xGPer90,
        xAPer90,
        xGIPer90
    }
}

const calculatePlayerFeatures = (player) => {
    return {
        // Identity / position
        elementType: player.elementType,

        // Price / market
        price: player.price,
        selectedByPercent: player.selectedByPercent,
        transfersIn: player.transfersIn,
        transfersOut: player.transfersOut,

        // Current production
        form: player.form,
        totalPoints: player.totalPoints,
        pointsPerGame: player.pointsPerGame,

        // Playing time
        minutes: player.minutes,
        starts: player.starts,

        // Attacking output
        goalsScored: player.goalsScored,
        assists: player.assists,

        // Defensive / goalkeeper output
        cleanSheets: player.cleanSheets,
        goalsConceded: player.goalsConceded,
        saves: player.saves,

        // FPL scoring
        bonus: player.bonus,
        bps: player.bps,

        // Underlying performance
        expectedGoals: player.expectedGoals,
        expectedAssists: player.expectedAssists,
        expectedGoalInvolvements: player.expectedGoalInvolvements,
        expectedGoalsConceded: player.expectedGoalsConceded,

        // ICT
        influence: player.influence,
        creativity: player.creativity,
        threat: player.threat,
        ictIndex: player.ictIndex,

        // Discipline
        yellowCards: player.yellowCards,
        redCards: player.redCards,

        // Defensive actions
        clearancesBlocksInterceptions: player.clearancesBlocksInterceptions,
        recoveries: player.recoveries,
        tackles: player.tackles,
        defensiveContribution: player.defensiveContribution
    }
}

const getPredictionFeatures = async (playerId) => {
    const player = await Player.findOne({ fplId: playerId, removed: false }).lean()
    if (!player) {
        return null
    }

    const gameweeks = await PlayerGameweek.find({ playerId: playerId })
        .sort({ gameweek: -1 })
        .lean()
    if (gameweeks.length === 0) {
        return null
    }

    const fixtures = await calculateFixtureFeatures(player.team)
    const historical = await calculateHistoricalFeatures(playerId)
    const playerFeatures = calculatePlayerFeatures(player)

    const lastGameweek = gameweeks.slice(0, 1)
    const last3Gameweeks = gameweeks.slice(0, 3)
    const last5Gameweeks = gameweeks.slice(0, 5)
    const last10Gameweeks = gameweeks.slice(0, 10)

    return {
        playerId,

        recent: {
            lastGameweek: calculateWindow(lastGameweek),
            last3Gameweeks: calculateWindow(last3Gameweeks),
            last5Gameweeks: calculateWindow(last5Gameweeks),
            last10Gameweeks: calculateWindow(last10Gameweeks)
        },

        availability: calculateAvailabilityFeatures(player, lastGameweek, last3Gameweeks, last5Gameweeks, last10Gameweeks),
    
        fixtures,
        
        historical,

        player: playerFeatures
    }
}

module.exports = {
    getPredictionFeatures
}