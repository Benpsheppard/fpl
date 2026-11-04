// featureBuilder.js
//
// Single source of truth for model features. Training rows and prediction
// requests both go through buildFeatureSet, so the model sees the same schema
// and semantics in both. The only thing that varies is the gameweek being
// predicted: pass only gameweeks played before it as previousGameweeks.

const kickoffMs = (fixture) => fixture.kickoffTime ? new Date(fixture.kickoffTime).getTime() : 0

// Sum of a numeric field across rows, treating missing values as 0
const sumBy = (rows, field) => rows.reduce((sum, row) => sum + (row[field] || 0), 0)

const calculateWindow = (window) => {
    const minutes = sumBy(window, "minutes")
    const totalPoints = sumBy(window, "totalPoints")

    const goals = sumBy(window, "goalsScored")
    const assists = sumBy(window, "assists")

    const xG = Number( sumBy(window, "expectedGoals").toFixed(2) )
    const xA = Number( sumBy(window, "expectedAssists").toFixed(2) )
    const xGI = Number( sumBy(window, "expectedGoalInvolvements").toFixed(2) )

    const starts = sumBy(window, "starts")
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
        const minutes = sumBy(window, "minutes")

        const starts = sumBy(window, "starts")
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

    const totalPoints = sumBy(seasons, "totalPoints")

    const minutes = sumBy(seasons, "minutes")

    const goals = sumBy(seasons, "goalsScored")

    const assists = sumBy(seasons, "assists")

    const xG = sumBy(seasons, "expectedGoals")

    const xA = sumBy(seasons, "expectedAssists")

    const xGI = sumBy(seasons, "expectedGoalInvolvements")

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

    const totalPoints = sumBy(previousGameweeks, "totalPoints")
    const minutes = sumBy(previousGameweeks, "minutes")

    const goalsScored = sumBy(previousGameweeks, "goalsScored")
    const assists = sumBy(previousGameweeks, "assists")

    const cleanSheets = sumBy(previousGameweeks, "cleanSheets")
    const goalsConceded = sumBy(previousGameweeks, "goalsConceded")
    const saves = sumBy(previousGameweeks, "saves")

    const ownGoals = sumBy(previousGameweeks, "ownGoals")
    const penaltiesSaved = sumBy(previousGameweeks, "penaltiesSaved")
    const penaltiesMissed = sumBy(previousGameweeks, "penaltiesMissed")

    const bonus = sumBy(previousGameweeks, "bonus")
    const bps = sumBy(previousGameweeks, "bps")

    const expectedGoals = sumBy(previousGameweeks, "expectedGoals")
    const expectedAssists = sumBy(previousGameweeks, "expectedAssists")
    const expectedGoalInvolvements = sumBy(previousGameweeks, "expectedGoalInvolvements")
    const expectedGoalsConceded = sumBy(previousGameweeks, "expectedGoalsConceded")

    const influence = sumBy(previousGameweeks, "influence")
    const creativity = sumBy(previousGameweeks, "creativity")
    const threat = sumBy(previousGameweeks, "threat")
    const ictIndex = sumBy(previousGameweeks, "ictIndex")

    const yellowCards = sumBy(previousGameweeks, "yellowCards")
    const redCards = sumBy(previousGameweeks, "redCards")

    const clearancesBlocksInterceptions = sumBy(previousGameweeks, "clearancesBlocksInterceptions")
    const recoveries = sumBy(previousGameweeks, "recoveries")
    const tackles = sumBy(previousGameweeks, "tackles")

    const defensiveContribution = sumBy(previousGameweeks, "defensiveContribution")
    const defensiveActions = clearancesBlocksInterceptions + recoveries + tackles
    const defensiveActionsPer90 = minutes > 0 ? Number(((defensiveActions / minutes) * 90).toFixed(2)) : 0

    const starts = sumBy(previousGameweeks, "starts")

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
//   asOfGameweek       team form uses fixtures finished before this gameweek. It is the fixture's own
//                      gameweek unless the forecast is made earlier (looking several gameweeks ahead),
//                      when the form is as old as the forecast.
const buildFeatureSet = ({
    player,
    teamId,
    opponentTeamId,
    isHome,
    fixture,
    previousGameweeks,
    seasons,
    fixtures,
    fixtureById,
    asOfGameweek
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

    const targetGameweek = asOfGameweek ?? fixture.gameweek

    // The team's other fixtures in this gameweek, earliest first. A double gameweek
    // is two fixtures; the player's gameweek row sums points across both.
    const otherFixtures = fixtures
        .filter((candidate) =>
            candidate.gameweek === fixture.gameweek &&
            candidate.fplId !== fixture.fplId &&
            (candidate.homeTeam === teamId || candidate.awayTeam === teamId)
        )
        .sort((a, b) => kickoffMs(a) - kickoffMs(b))
    const secondFixture = otherFixtures[0]
    const secondFixtureIsHome = secondFixture ? secondFixture.homeTeam === teamId : false

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
            difficulty: Number(isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty),

            // 1 normally, 2+ in a double gameweek. The second fixture's details are 0 when there is none.
            fixturesInGameweek: 1 + otherFixtures.length,
            secondFixtureIsHome,
            secondFixtureDifficulty: secondFixture
                ? Number(secondFixtureIsHome ? secondFixture.homeTeamDifficulty : secondFixture.awayTeamDifficulty)
                : 0
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
