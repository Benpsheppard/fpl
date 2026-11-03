// featureBuilder.js
//
// Single source of truth for model features. Training rows and prediction
// requests both go through buildFeatureSet, so the model sees the same schema
// and semantics in both. The only thing that varies is the gameweek being
// predicted: pass only gameweeks played before it as previousGameweeks.

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


const calculatePlayerFeaturesForGameweek = (player, previousGameweeks) => {
    const latestPreviousGameweek = previousGameweeks.at(-1)

    const value = latestPreviousGameweek?.value ?? 0
    const selected = latestPreviousGameweek?.selected ?? 0
    const transfersIn = latestPreviousGameweek?.transfersIn || 0
    const transfersOut = latestPreviousGameweek?.transfersOut || 0

    const totalPoints = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.totalPoints || 0), 0 )
    const minutes = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.minutes || 0), 0 )

    const goalsScored = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.goalsScored || 0), 0 )
    const assists = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.assists || 0), 0 )

    const cleanSheets = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.cleanSheets || 0), 0 )
    const goalsConceded = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.goalsConceded || 0), 0 )
    const saves = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.saves || 0), 0 )

    const ownGoals = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.ownGoals || 0), 0 )
    const penaltiesSaved = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.penaltiesSaved || 0), 0 )
    const penaltiesMissed = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.penaltiesMissed || 0), 0 )

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
    const defensiveActions = clearancesBlocksInterceptions + recoveries + tackles
    const defensiveActionsPer90 = minutes > 0 ? Number(((defensiveActions / minutes) * 90).toFixed(2)) : 0

    const starts = previousGameweeks.reduce( (sum, gameweek) => sum + (gameweek.starts || 0), 0 )

    const pointsPerGame = previousGameweeks.length > 0 ? Number( (totalPoints / previousGameweeks.length).toFixed(2) ) : 0
    const pointsPer90 = minutes > 0 ? Number(((totalPoints / minutes) * 90).toFixed(2)) : 0

    return {
        elementType: player.elementType,

        totalPoints,
        pointsPerGame,
        minutes,
        starts,

        goalsScored,
        assists,
        cleanSheets,
        goalsConceded,
        saves,

        penaltiesMissed,
        penaltiesSaved,

        ownGoals,
        defensiveActions,
        defensiveActionsPer90,

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

        pointsPer90,

        value,
        selected,
        transfersIn,
        transfersOut
    }
}

const calculateTeamFeatures = (teamId, targetGameweek, fixtures, venue = "all", windowSize = 5) => {
    const previousFixtures = fixtures
        .filter((fixture) => {
            if (fixture.gameweek >= targetGameweek) {
                return false
            }

            if (!fixture.finished) {
                return false
            }

            const isHome = fixture.homeTeam === teamId
            const isAway = fixture.awayTeam === teamId

            if (!isHome && !isAway) {
                return false
            }

            if (venue === "home" && !isHome) {
                return false
            }

            if (venue === "away" && !isAway) {
                return false
            }

            return true
        })
        .sort((a, b) => b.gameweek - a.gameweek)
        .slice(0, windowSize)

    let goalsScored = 0
    let goalsConceded = 0
    let wins = 0
    let draws = 0
    let losses = 0
    let cleanSheets = 0

    for (const fixture of previousFixtures) {
        const isHome = fixture.homeTeam === teamId

        const scored = Number(isHome ? fixture.homeScore : fixture.awayScore)
        const conceded = Number(isHome ? fixture.awayScore : fixture.homeScore)

        if (!Number.isFinite(scored) ||
            !Number.isFinite(conceded)) {
            continue
        }

        goalsScored += scored
        goalsConceded += conceded

        if (scored > conceded) wins++
        else if (scored === conceded) draws++
        else losses++

        if (conceded === 0) cleanSheets++
    }

    const matches = wins + draws + losses

    const perMatch = (value) => matches > 0 ? Number((value / matches).toFixed(3)) : 0

    return {
        matches,
        goalsScoredPerMatch: perMatch(goalsScored),
        goalsConcededPerMatch: perMatch(goalsConceded),
        winRate: perMatch(wins),
        drawRate: perMatch(draws),
        lossRate: perMatch(losses),
        cleanSheetRate: perMatch(cleanSheets),
        pointsPerMatch: perMatch(wins * 3 + draws)
    }
}

// Features for one player ahead of one fixture.
//   player             Player document
//   teamId             team the player is playing for in this fixture
//   opponentTeamId     opposing team
//   isHome             whether teamId is at home
//   fixture            the Fixture being predicted
//   previousGameweeks  the player's PlayerGameweek rows before this fixture, oldest first
//   seasons            the player's PlayerSeason rows
//   fixtures           all Fixture rows (for team form)
//   fixtureById        Map of fixture fplId to Fixture
const buildFeatureSet = ({
    player,
    teamId,
    opponentTeamId,
    isHome,
    fixture,
    previousGameweeks,
    seasons,
    fixtures,
    fixtureById
}) => {
    const lastGameweek = previousGameweeks.slice(-1)
    const last3Gameweeks = previousGameweeks.slice(-3)
    const last5Gameweeks = previousGameweeks.slice(-5)
    const last10Gameweeks = previousGameweeks.slice(-10)

    const recentPoints = last5Gameweeks.map((gameweek) => gameweek.totalPoints || 0)
    const recentMaxPoints = recentPoints.length > 0 ? Math.max(...recentPoints) : 0

    const historicalFixturePerformance = previousGameweeks.map((gameweek) => {
        const playedFixture = fixtureById.get(gameweek.fixtureId)

        if (!playedFixture || typeof gameweek.wasHome !== "boolean") {
            return null
        }

        const difficulty = Number(gameweek.wasHome ? playedFixture.homeTeamDifficulty : playedFixture.awayTeamDifficulty)

        return {
            points: gameweek.totalPoints || 0,
            difficulty
        }
    }).filter(Boolean)

    const targetGameweek = fixture.gameweek

    return {
        recent: {
            lastGameweek: calculateWindow(lastGameweek),
            last3Gameweeks: calculateWindow(last3Gameweeks),
            last5Gameweeks: calculateWindow(last5Gameweeks),
            last10Gameweeks: calculateWindow(last10Gameweeks),

            recentMaxPoints
        },

        availability: calculateAvailabilityFeatures(
            lastGameweek,
            last3Gameweeks,
            last5Gameweeks,
            last10Gameweeks
        ),

        historical: calculateHistoricalFeaturesFromData(seasons),
        historicalFixturePerformance,

        fixtures: {
            fixtureId: fixture.fplId,
            gameweek: fixture.gameweek,
            isHome,
            difficulty: Number(isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty)
        },

        player: calculatePlayerFeaturesForGameweek(player, previousGameweeks),

        team: {
            overall: calculateTeamFeatures(teamId, targetGameweek, fixtures, "all", 5),
            venue: calculateTeamFeatures(teamId, targetGameweek, fixtures, isHome ? "home" : "away", 5),
            opponentOverall: calculateTeamFeatures(opponentTeamId, targetGameweek, fixtures, "all", 5),
            opponentVenue: calculateTeamFeatures(opponentTeamId, targetGameweek, fixtures, isHome ? "away" : "home", 5)
        }
    }
}

module.exports = {
    buildFeatureSet,
    calculateWindow,
    calculateAvailabilityFeatures,
    calculateHistoricalFeaturesFromData,
    calculatePlayerFeaturesForGameweek,
    calculateTeamFeatures
}
