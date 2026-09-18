// trainingDatasetService.js

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")
const Team = require("../models/teamModel")

const buildTrainingRow = async (playerId, gameweek) => {
    const player = await Player.findOne({ fplId: playerId, removed: false }).lean()
    if (!player) {
        return null
    }

    const previousGameweeks = await PlayerGameweek.find({ playerId: playerId, gameweek: { $lt: gameweek } })
        .sort({ gameweek: -1 })
        .lean()
    if (previousGameweeks.length < 3) {
        return null
    }

    const lastGameweek = previousGameweeks.slice(0, 1)
    const last3Gameweeks = previousGameweeks.slice(0, 3)
    const last5Gameweeks = previousGameweeks.slice(0, 5)
    const last10Gameweeks = previousGameweeks.slice(0, 10)

    const targetGameweek = await PlayerGameweek.findOne({ playerId: playerId, gameweek: gameweek }).lean()
    if (!targetGameweek) {
        return null
    }

    const fixtureFeatures = await calculateFixtureFeaturesForGameweek(player.team, gameweek)

    const playerFeatures = calculatePlayerFeaturesForGameweek(player, previousGameweeks)

    return {
        playerId,
        gameweek,

        features: {
            recent: {
                lastGameweek: calculateWindow(lastGameweek),
                last3Gameweeks: calculateWindow(last3Gameweeks),
                last5Gameweeks: calculateWindow(last5Gameweeks),
                last10Gameweeks: calculateWindow(last10Gameweeks)
            },

            availability: calculateAvailabilityFeatures(
                lastGameweek,
                last3Gameweeks,
                last5Gameweeks,
                last10Gameweeks
            ),
            
            historical: await calculateHistoricalFeatures(playerId),

            fixtures: fixtureFeatures,

            player: playerFeatures
        },

        target: {
            totalPoints: targetGameweek.totalPoints
        }
    }
}

const calculateWindow = (window) => {
    const minutes = window.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )
    const totalPoints = window.reduce( (sum, gameweek) => sum + (gameweek.totalPoints || 0), 0 )

    const goals = window.reduce( (sum, gameweek) => sum + (gameweek.goalsScored || 0), 0 )
    const assists = window.reduce( (sum, gameweek) => sum + (gameweek.assists || 0), 0 )

    const xG = Number( window.reduce( (sum, gameweek) => sum + (gameweek.expectedGoals || 0), 0 ).toFixed(2) )
    const xA = Number( window.reduce( (sum, gameweek) => sum + (gameweek.expectedAssists || 0), 0 ).toFixed(2) )
    const xGI = Number( window.reduce( (sum, gameweek) => sum + (gameweek.expectedGoalInvolvements || 0), 0 ).toFixed(2) )

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

const calculateAvailabilityFeatures = (lastGameweek, last3Gameweeks, last5Gameweeks, last10Gameweeks) => {
    const calculateAvailabilityWindow = (window) => {
        const minutes = window.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )

        const starts = window.reduce( (sum, gameweek) => sum + (gameweek.starts || 0), 0 )
        const appearances = window.filter( (gameweek) => (gameweek.minutes || 0) > 0 ).length

        const minutesPerGame = window.length > 0 ? Number((minutes / window.length).toFixed(2)) : 0
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
        lastGameweek: calculateAvailabilityWindow(lastGameweek),
        last3Gameweeks: calculateAvailabilityWindow(last3Gameweeks),
        last5Gameweeks: calculateAvailabilityWindow(last5Gameweeks),
        last10Gameweeks: calculateAvailabilityWindow(last10Gameweeks)
    }
}

const calculateHistoricalFeatures = async (playerId) => {
    const seasons = await PlayerSeason.find({ playerId: playerId })
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

const calculateHistoricalFeaturesFromData = (seasons) => {
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

    const totalPoints = seasons.reduce(
        (sum, season) => sum + (season.totalPoints || 0),
        0
    )

    const minutes = seasons.reduce(
        (sum, season) => sum + (season.minutes || 0),
        0
    )

    const goals = seasons.reduce(
        (sum, season) => sum + (season.goalsScored || 0),
        0
    )

    const assists = seasons.reduce(
        (sum, season) => sum + (season.assists || 0),
        0
    )

    const xG = seasons.reduce(
        (sum, season) => sum + (season.expectedGoals || 0),
        0
    )

    const xA = seasons.reduce(
        (sum, season) => sum + (season.expectedAssists || 0),
        0
    )

    const xGI = seasons.reduce(
        (sum, season) =>
            sum + (season.expectedGoalInvolvements || 0),
        0
    )

    const pointsPer90 = minutes > 0
        ? Number(((totalPoints / minutes) * 90).toFixed(2))
        : 0

    const goalsPer90 = minutes > 0
        ? Number(((goals / minutes) * 90).toFixed(2))
        : 0

    const assistsPer90 = minutes > 0
        ? Number(((assists / minutes) * 90).toFixed(2))
        : 0

    const xGPer90 = minutes > 0
        ? Number(((xG / minutes) * 90).toFixed(2))
        : 0

    const xAPer90 = minutes > 0
        ? Number(((xA / minutes) * 90).toFixed(2))
        : 0

    const xGIPer90 = minutes > 0
        ? Number(((xGI / minutes) * 90).toFixed(2))
        : 0

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

const calculateFixtureFeaturesForGameweek = async (playerTeamId, gameweek) => {
    const fixture = await Fixture.findOne({
        gameweek: gameweek,
        $or: [
            { homeTeam: playerTeamId },
            { awayTeam: playerTeamId }
        ]
    }).lean()

    if (!fixture) {
        return null
    }

    const isHome = fixture.homeTeam === playerTeamId

    const opponentTeamId = isHome
        ? fixture.awayTeam
        : fixture.homeTeam

    const opponent = await Team.findOne({
        fplId: opponentTeamId
    }).lean()

    const difficulty = Number(
        isHome
            ? fixture.homeTeamDifficulty
            : fixture.awayTeamDifficulty
    )

    const opponentStrength = opponent
        ? Number(
            isHome
                ? opponent.strengthOverallAway
                : opponent.strengthOverallHome
        )
        : 0

    return {
        fixtureId: fixture.fplId,
        gameweek: fixture.gameweek,
        isHome,
        difficulty,
        opponentStrength
    }
}

const calculatePlayerFeaturesForGameweek = (player, previousGameweeks) => {
    const totalPoints = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.totalPoints || 0), 0 )
    const minutes = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )

    const goalsScored = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.goalsScored || 0), 0 )
    const assists = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.assists || 0), 0 )

    const cleanSheets = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.cleanSheets || 0), 0 )
    const goalsConceded = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.goalsConceded || 0), 0 )
    const saves = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.saves || 0), 0 )

    const bonus = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.bonus || 0), 0 )
    const bps = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.bps || 0), 0 )

    const expectedGoals = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.expectedGoals || 0), 0 )
    const expectedAssists = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.expectedAssists || 0), 0 )
    const expectedGoalInvolvements = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.expectedGoalInvolvements || 0), 0 )
    const expectedGoalsConceded = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.expectedGoalsConceded || 0), 0 )

    const influence = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.influence || 0), 0 )
    const creativity = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.creativity || 0), 0 )
    const threat = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.threat || 0), 0 )
    const ictIndex = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.ictIndex || 0), 0 )

    const yellowCards = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.yellowCards || 0), 0 )
    const redCards = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.redCards || 0), 0 )

    const clearancesBlocksInterceptions = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.clearancesBlocksInterceptions || 0), 0 )
    const recoveries = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.recoveries || 0), 0 )
    const tackles = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.tackles || 0), 0 )
    const defensiveContribution = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.defensiveContribution || 0), 0 )

    const starts = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.starts || 0), 0 )

    const pointsPerGame = previousGameweeks.length > 0 ? Number( (totalPoints / previousGameweeks.length).toFixed(2) ) : 0
    const pointsPer90 = minutes > 0 ? Number(((totalPoints / minutes) * 90).toFixed(2)) : 0

    return {
        elementType: player.elementType,

        // Current-season cumulative performance
        totalPoints,
        pointsPerGame,
        minutes,
        starts,

        goalsScored,
        assists,
        cleanSheets,
        goalsConceded,
        saves,

        bonus,
        bps,

        expectedGoals: Number(expectedGoals.toFixed(2)),
        expectedAssists: Number(expectedAssists.toFixed(2)),
        expectedGoalInvolvements: Number(expectedGoalInvolvements.toFixed(2)),
        expectedGoalsConceded: Number(expectedGoalsConceded.toFixed(2)),

        influence: Number(influence.toFixed(2)),
        creativity: Number(creativity.toFixed(2)),
        threat: Number(threat.toFixed(2)),
        ictIndex: Number(ictIndex.toFixed(2)),

        yellowCards,
        redCards,

        clearancesBlocksInterceptions,
        recoveries,
        tackles,
        defensiveContribution,

        pointsPer90
    }
}

const buildTrainingDataset = async () => {
    const [
        players,
        gameweeks,
        seasons,
        fixtures,
        teams
    ] = await Promise.all([
        Player.find({
            removed: false
        }).lean(),

        PlayerGameweek.find()
            .sort({ gameweek: 1 })
            .lean(),

        PlayerSeason.find()
            .lean(),

        Fixture.find()
            .lean(),

        Team.find()
            .lean()
    ])

    // Build lookup maps
    const playerGameweeksMap = new Map()

    for (const gameweek of gameweeks) {
        if (!playerGameweeksMap.has(gameweek.playerId)) {
            playerGameweeksMap.set(gameweek.playerId, [])
        }

        playerGameweeksMap
            .get(gameweek.playerId)
            .push(gameweek)
    }

    const seasonsMap = new Map()

    for (const season of seasons) {
        if (!seasonsMap.has(season.playerId)) {
            seasonsMap.set(season.playerId, [])
        }

        seasonsMap
            .get(season.playerId)
            .push(season)
    }

    const fixturesMap = new Map()

    for (const fixture of fixtures) {
        if (!fixturesMap.has(fixture.gameweek)) {
            fixturesMap.set(fixture.gameweek, [])
        }

        fixturesMap
            .get(fixture.gameweek)
            .push(fixture)
    }

    const teamMap = new Map(
        teams.map((team) => [
            team.fplId,
            team
        ])
    )

    const trainingRows = []

    // Build rows
    for (const player of players) {
        const playerGameweeks =
            playerGameweeksMap.get(player.fplId) || []

        if (playerGameweeks.length < 4) {
            continue
        }

        for (let i = 3; i < playerGameweeks.length; i++) {
            const targetGameweek =
                playerGameweeks[i]

            const previousGameweeks =
                playerGameweeks.slice(0, i)

            const lastGameweek =
                previousGameweeks.slice(-1)

            const last3Gameweeks =
                previousGameweeks.slice(-3)

            const last5Gameweeks =
                previousGameweeks.slice(-5)

            const last10Gameweeks =
                previousGameweeks.slice(-10)

            // Find player's fixture
            const gameweekFixtures =
                fixturesMap.get(
                    targetGameweek.gameweek
                ) || []

            const fixture =
                gameweekFixtures.find((fixture) =>
                    fixture.homeTeam === player.team ||
                    fixture.awayTeam === player.team
                )

            if (!fixture) {
                continue
            }

            const isHome =
                fixture.homeTeam === player.team

            const opponentTeamId = isHome
                ? fixture.awayTeam
                : fixture.homeTeam

            const opponent =
                teamMap.get(opponentTeamId)

            const difficulty = Number(
                isHome
                    ? fixture.homeTeamDifficulty
                    : fixture.awayTeamDifficulty
            )

            const opponentStrength = opponent
                ? Number(
                    isHome
                        ? opponent.strengthOverallAway
                        : opponent.strengthOverallHome
                )
                : 0

            const playerFeatures =
                calculatePlayerFeaturesForGameweek(
                    player,
                    previousGameweeks
                )

            const historicalSeasons =
                seasonsMap.get(player.fplId) || []

            const historical =
                calculateHistoricalFeaturesFromData(
                    historicalSeasons
                )

            trainingRows.push({
                playerId: player.fplId,
                gameweek: targetGameweek.gameweek,

                features: {
                    recent: {
                        lastGameweek:
                            calculateWindow(lastGameweek),

                        last3Gameweeks:
                            calculateWindow(last3Gameweeks),

                        last5Gameweeks:
                            calculateWindow(last5Gameweeks),

                        last10Gameweeks:
                            calculateWindow(last10Gameweeks)
                    },

                    availability:
                        calculateAvailabilityFeatures(
                            lastGameweek,
                            last3Gameweeks,
                            last5Gameweeks,
                            last10Gameweeks
                        ),

                    historical,

                    fixtures: {
                        fixtureId: fixture.fplId,
                        gameweek: fixture.gameweek,
                        isHome,
                        difficulty,
                        opponentStrength
                    },

                    player: playerFeatures
                },

                target: {
                    totalPoints:
                        targetGameweek.totalPoints
                }
            })
        }
    }

    return trainingRows
}

module.exports = {
    buildTrainingRow,
    buildTrainingDataset
}