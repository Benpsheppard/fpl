// predictionFeatureService.js

const PlayerGameweek = require("../models/playerGameweekModel")
const Player = require("../models/playerModel")
const Fixture = require("../models/fixtureModel")
const PlayerSeason = require("../models/playerSeasonModel")

const { buildFeatureSet } = require("./featureBuilder")

// Statuses that mean the player cannot play: injured, suspended, unavailable, not in squad
const UNAVAILABLE_STATUSES = new Set([ "i", "s", "u", "n" ])

// How likely the player is to be available for the gameweek being predicted, as 0-1 (null when unknown).
// FPL only publishes news for the coming round: "next round" before a gameweek starts,
// "this round" once it is under way. Anything further ahead has no news, so no adjustment.
const getAvailability = (player, fixtures, targetGameweek) => {
    const unfinished = fixtures.filter((fixture) => !fixture.finished && fixture.gameweek)
    const nextRound = unfinished.length > 0 ? Math.min(...unfinished.map((fixture) => fixture.gameweek)) : null

    if (targetGameweek !== nextRound) {
        return { status: player.status, chance: null, basis: "none", source: "none" }
    }

    const roundStarted = fixtures.some((fixture) => fixture.finished && fixture.gameweek === nextRound)
    const basis = roundStarted ? "this_round" : "next_round"
    const reported = roundStarted ? player.chanceOfPlayingThisRound : player.chanceOfPlayingNextRound

    // FPL leaves the percentage empty for fit players and for some who are out
    if (reported !== null && reported !== undefined) {
        return { status: player.status, chance: reported / 100, basis, source: "reported" }
    }
    if (player.status === "a") {
        return { status: player.status, chance: 1, basis, source: "status" }
    }
    if (UNAVAILABLE_STATUSES.has(player.status)) {
        return { status: player.status, chance: 0, basis, source: "status" }
    }

    return { status: player.status, chance: null, basis, source: "none" }
}

const getUpcomingFixtures = (fixtures, playerTeamId, now) => {
    return fixtures
        .filter((fixture) => fixture.homeTeam === playerTeamId || fixture.awayTeam === playerTeamId)
        .filter((fixture) => fixture.kickoffTime && new Date(fixture.kickoffTime) > now)
        .sort((a, b) => new Date(a.kickoffTime) - new Date(b.kickoffTime))
}

// Schedule outlook shown alongside the features. It is not part of the model
// schema because training has no equivalent for it.
const calculateFixtureLookahead = (playerTeamId, upcomingFixtures, now) => {
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

    const fixtureFeatures = upcomingFixtures.map((fixture) => {
        const isHome = fixture.homeTeam === playerTeamId

        const difficulty = Number(isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty)

        return {
            fixtureId: fixture.fplId,
            gameweek: fixture.gameweek,
            isHome,
            difficulty,
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
                difficulty: nextFixture.difficulty
            }
            : null,

        averageDaysBetweenFixtures
    }
}

const getPredictionFeatures = async (playerId) => {
    const player = await Player.findOne({ fplId: playerId, removed: false }).lean()
    if (!player) {
        return null
    }

    const [ playerGameweeks, seasons, fixtures ] = await Promise.all([
        PlayerGameweek.find({ playerId: playerId }).sort({ gameweek: 1 }).lean(),
        PlayerSeason.find({ playerId: playerId }).lean(),
        Fixture.find().lean()
    ])
    if (playerGameweeks.length === 0) {
        return null
    }

    const now = new Date()
    const upcomingFixtures = getUpcomingFixtures(fixtures, player.team, now)
    const nextFixture = upcomingFixtures[0]
    if (!nextFixture) {
        return null
    }

    const isHome = nextFixture.homeTeam === player.team
    const opponentTeamId = isHome ? nextFixture.awayTeam : nextFixture.homeTeam

    // Same function the training dataset uses, with only gameweeks that come
    // before the fixture being predicted
    const features = buildFeatureSet({
        player,
        teamId: player.team,
        opponentTeamId,
        isHome,
        fixture: nextFixture,
        previousGameweeks: playerGameweeks.filter((gameweek) => gameweek.gameweek < nextFixture.gameweek),
        seasons,
        fixtures,
        fixtureById: new Map(fixtures.map((fixture) => [ fixture.fplId, fixture ]))
    })

    return {
        playerId,
        gameweek: nextFixture.gameweek,

        features,

        // Live information with no training equivalent, so not model inputs
        context: {
            player: {
                firstName: player.firstName,
                secondName: player.secondName,
                webName: player.webName
            },
            availability: getAvailability(player, fixtures, nextFixture.gameweek),
            status: player.status,
            chanceOfPlayingThisRound: player.chanceOfPlayingThisRound,
            chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,
            fixtureLookahead: calculateFixtureLookahead(player.team, upcomingFixtures, now)
        }
    }
}

module.exports = {
    getPredictionFeatures
}
