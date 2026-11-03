// trainingDatasetService.js

const Player = require("../models/playerModel")
const PlayerGameweek = require("../models/playerGameweekModel")
const PlayerSeason = require("../models/playerSeasonModel")
const Fixture = require("../models/fixtureModel")

const { buildFeatureSet } = require("./featureBuilder")
const { getCachedDataset } = require("./datasetCache")

const buildTrainingRow = async (playerId, gameweek) => {
    const player = await Player.findOne({ fplId: playerId, removed: false }).lean()
    if (!player) {
        return null
    }

    const [ playerGameweeks, seasons, fixtures ] = await Promise.all([
        PlayerGameweek.find({ playerId: playerId }).sort({ gameweek: 1 }).lean(),
        PlayerSeason.find({ playerId: playerId }).lean(),
        Fixture.find().lean()
    ])

    const previousGameweeks = playerGameweeks.filter((row) => row.gameweek < gameweek)
    if (previousGameweeks.length < 3) {
        return null
    }

    const targetGameweek = playerGameweeks.find((row) => row.gameweek === gameweek)
    if (!targetGameweek) {
        return null
    }

    const fixtureById = new Map(fixtures.map((fixture) => [ fixture.fplId, fixture ]))
    const fixture = fixtureById.get(targetGameweek.fixtureId)
    if (!fixture || typeof targetGameweek.wasHome !== "boolean") {
        return null
    }

    return {
        playerId,
        gameweek,

        features: buildFeatureSet({
            player,
            teamId: targetGameweek.wasHome ? fixture.homeTeam : fixture.awayTeam,
            opponentTeamId: targetGameweek.opponentTeam,
            isHome: targetGameweek.wasHome,
            fixture,
            previousGameweeks,
            seasons,
            fixtures,
            fixtureById
        }),

        target: {
            totalPoints: targetGameweek.totalPoints,
            totalMinutes: targetGameweek.minutes
        }
    }
}

const buildTrainingDataset = async () => {
    const [ players, gameweeks, seasons, fixtures ] = await Promise.all([
        Player.find({
            removed: false
        }).lean(),

        PlayerGameweek.find()
            .sort({ gameweek: 1 })
            .lean(),

        PlayerSeason.find()
            .lean(),

        Fixture.find()
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

    const fixtureByIdMap = new Map(
        fixtures.map((fixture) => [
            fixture.fplId,
            fixture
        ])
    )

    // Team the player was actually playing for in a gameweek, taken from the
    // fixture recorded on their gameweek row rather than their current team
    const getTeamForGameweek = (playerGameweek, fallbackTeam) => {
        const fixture = fixtureByIdMap.get(playerGameweek.fixtureId)

        if (!fixture || typeof playerGameweek.wasHome !== "boolean") {
            return fallbackTeam
        }

        return playerGameweek.wasHome ? fixture.homeTeam : fixture.awayTeam
    }

    const trainingRows = []

    // Build rows
    for (const player of players) {
        const playerGameweeks = (playerGameweeksMap.get(player.fplId) || [])
            .sort((a, b) => a.gameweek - b.gameweek)

        const historicalSeasons = seasonsMap.get(player.fplId) || []

        for (const [ index, targetGameweek ] of playerGameweeks.entries()) {
            // The fixture comes from the gameweek row itself, so a player who
            // changed team is matched to the team they were actually on
            const fixture = fixtureByIdMap.get(targetGameweek.fixtureId)

            if (!fixture || typeof targetGameweek.wasHome !== "boolean") {
                continue
            }

            trainingRows.push({
                playerId: player.fplId,
                gameweek: targetGameweek.gameweek,

                features: buildFeatureSet({
                    player,
                    teamId: getTeamForGameweek(targetGameweek, player.team),
                    opponentTeamId: targetGameweek.opponentTeam,
                    isHome: targetGameweek.wasHome,
                    fixture,
                    previousGameweeks: playerGameweeks.slice(0, index), // sorted, one row per gameweek
                    seasons: historicalSeasons,
                    fixtures,
                    fixtureById: fixtureByIdMap
                }),

                target: {
                    totalPoints: targetGameweek.totalPoints,
                    totalMinutes: targetGameweek.minutes
                }
            })
        }
    }

    // Check where Rows come from
    const rowsByGameweek = {}
    for (const row of trainingRows) {
        if (!rowsByGameweek[row.gameweek]) {
            rowsByGameweek[row.gameweek] = 0
        }

        rowsByGameweek[row.gameweek]++
    }
    console.log("Total training rows:", trainingRows.length)
    console.log("Rows by gameweek:", rowsByGameweek)

    // Validate newly created dataset
    const validation = await validateTrainingDataset(trainingRows, gameweeks)
    console.log("Dataset validation: ", JSON.stringify({
        ...validation,
        issues: validation.issues.slice(0, 20)
    }, null, 2))
    if (validation.issueCount > 20) {
        console.log(`...and ${validation.issueCount - 20} more issues`)
    }

    return trainingRows
}

const validateTrainingDataset = async (trainingRows, preloadedGameweeks) => {
    const issues = []

    const seenRows = new Set()

    const gameweeks = preloadedGameweeks ?? await PlayerGameweek.find()
        .sort({ gameweek: 1 })
        .lean()

    const playerGameweeksMap = new Map()

    for (const gameweek of gameweeks) {
        if (!playerGameweeksMap.has(gameweek.playerId)) {
            playerGameweeksMap.set(gameweek.playerId, [])
        }

        playerGameweeksMap
            .get(gameweek.playerId)
            .push(gameweek)
    }

    const compareFeature = (
        row,
        featureName,
        expected,
        actual
    ) => {
        if (Number(actual) !== Number(expected)) {
            issues.push({
                type: `player_${featureName}_mismatch`,
                playerId: row.playerId,
                gameweek: row.gameweek,
                expected,
                actual
            })
        }
    }

    for (const row of trainingRows) {

        // --------------------------------
        // Structural validation
        // --------------------------------

        if (!row.playerId) {
            issues.push({
                type: "missing_player_id",
                gameweek: row.gameweek
            })
        }

        if (!row.gameweek) {
            issues.push({
                type: "missing_gameweek",
                playerId: row.playerId
            })
        }

        if (
            !row.target ||
            row.target.totalPoints === undefined ||
            row.target.totalPoints === null
        ) {
            issues.push({
                type: "missing_target",
                playerId: row.playerId,
                gameweek: row.gameweek
            })
        }

        const key = `${row.playerId}-${row.gameweek}`

        if (seenRows.has(key)) {
            issues.push({
                type: "duplicate_row",
                playerId: row.playerId,
                gameweek: row.gameweek
            })
        }

        seenRows.add(key)


        // --------------------------------
        // Get previous gameweeks
        // --------------------------------

        const playerGameweeks =
            playerGameweeksMap.get(row.playerId) || []

        const previousGameweeks =
            playerGameweeks.filter(
                (gameweek) =>
                    gameweek.gameweek < row.gameweek
            )

        const lastGameweek = previousGameweeks.slice(-1)
        const last3Gameweeks = previousGameweeks.slice(-3)
        const last5Gameweeks = previousGameweeks.slice(-5)
        const last10Gameweeks = previousGameweeks.slice(-10)

        const expectedWindows = {
            lastGameweek,
            last3Gameweeks,
            last5Gameweeks,
            last10Gameweeks
        }

        for (const [windowName, window] of Object.entries(expectedWindows)) {
            const expected = calculateExpectedWindow(window)

            const actual =
                row.features?.recent?.[windowName]

            compareWindow(
                issues,
                row,
                windowName,
                expected,
                actual
            )

            const expectedAvailability =
                calculateExpectedAvailability(window)

            const actualAvailability =
                row.features?.availability?.[windowName]

            compareAvailabilityWindow(
                issues,
                row,
                windowName,
                expectedAvailability,
                actualAvailability
            )
        }

        const targetGameweek =
            playerGameweeks.find(
                (gameweek) =>
                    gameweek.gameweek === row.gameweek
            )

        if (!targetGameweek) {
            issues.push({
                type: "missing_target_gameweek",
                playerId: row.playerId,
                gameweek: row.gameweek
            })

            continue
        }

        const allFeatureGameweeks = previousGameweeks.map(
            (gameweek) => gameweek.gameweek
        )

        const futureGameweeks = allFeatureGameweeks.filter(
            (gameweek) => gameweek >= row.gameweek
        )

        if (futureGameweeks.length > 0) {
            issues.push({
                type: "future_gameweeks_in_rolling_windows",
                playerId: row.playerId,
                gameweek: row.gameweek,
                futureGameweeks
            })
        }


        // --------------------------------
        // Cumulative player features
        // --------------------------------

        const cumulativeFields = [
            "totalPoints",
            "minutes",
            "goalsScored",
            "assists",
            "cleanSheets",
            "goalsConceded",
            "saves",
            "bonus",
            "bps",
            "expectedGoals",
            "expectedAssists",
            "expectedGoalInvolvements",
            "expectedGoalsConceded",
            "influence",
            "creativity",
            "threat",
            "ictIndex",
            "yellowCards",
            "redCards",
            "clearancesBlocksInterceptions",
            "recoveries",
            "tackles",
            "defensiveContribution",
            "starts"
        ]

        for (const field of cumulativeFields) {

            const expected = previousGameweeks.reduce(
                (sum, gameweek) =>
                    sum + (Number(gameweek[field]) || 0),
                0
            )

            const actual =
                row.features.player[field]

            compareFeature(
                row,
                field,
                Number(expected.toFixed(2)),
                actual
            )
        }


        // --------------------------------
        // Check target is NOT in features
        // --------------------------------

        const latestPreviousGameweek =
            previousGameweeks[
                previousGameweeks.length - 1
            ]

        if (
            latestPreviousGameweek &&
            latestPreviousGameweek.gameweek >= row.gameweek
        ) {
            issues.push({
                type: "future_gameweek_in_features",
                playerId: row.playerId,
                gameweek: row.gameweek,
                latestFeatureGameweek:
                    latestPreviousGameweek.gameweek
            })
        }
    }

    return {
        valid: issues.length === 0,
        totalRows: trainingRows.length,
        uniqueRows: seenRows.size,
        issueCount: issues.length,
        issues
    }
}

const compareWindow = (issues, row, windowName, expected, actual) => {
    if (!actual) {
        issues.push({
            type: "missing_recent_window",
            playerId: row.playerId,
            gameweek: row.gameweek,
            window: windowName
        })
        return
    }

    const fields = [
        "gameweeks",
        "totalPoints",
        "minutes",
        "goals",
        "assists",
        "xG",
        "xA",
        "xGI",
        "starts",
        "appearances"
    ]

    for (const field of fields) {
        if (Number(actual[field]) !== Number(expected[field])) {
            issues.push({
                type: `recent_${windowName}_${field}_mismatch`,
                playerId: row.playerId,
                gameweek: row.gameweek,
                expected: expected[field],
                actual: actual[field]
            })
        }
    }
}

const calculateExpectedWindow = (window) => {
    const totalPoints = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.totalPoints) || 0),
        0
    )

    const minutes = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.minutes) || 0),
        0
    )

    const goals = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.goalsScored) || 0),
        0
    )

    const assists = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.assists) || 0),
        0
    )

    const xG = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.expectedGoals) || 0),
        0
    )

    const xA = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.expectedAssists) || 0),
        0
    )

    const xGI = window.reduce(
        (sum, gameweek) =>
            sum + (Number(gameweek.expectedGoalInvolvements) || 0),
        0
    )

    const starts = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.starts) || 0),
        0
    )

    const appearances = window.filter(
        (gameweek) => (Number(gameweek.minutes) || 0) > 0
    ).length

    return {
        gameweeks: window.length,
        totalPoints: Number(totalPoints.toFixed(2)),
        minutes,
        goals,
        assists,
        xG: Number(xG.toFixed(2)),
        xA: Number(xA.toFixed(2)),
        xGI: Number(xGI.toFixed(2)),
        starts,
        appearances
    }
}

const compareAvailabilityWindow = (
    issues,
    row,
    windowName,
    expected,
    actual
) => {
    if (!actual) {
        issues.push({
            type: "missing_availability_window",
            playerId: row.playerId,
            gameweek: row.gameweek,
            window: windowName
        })
        return
    }

    const fields = [
        "gameweeks",
        "minutes",
        "starts",
        "appearances",
        "minutesPerGame",
        "startRate",
        "appearanceRate"
    ]

    for (const field of fields) {
        if (Number(actual[field]) !== Number(expected[field])) {
            issues.push({
                type: `availability_${windowName}_${field}_mismatch`,
                playerId: row.playerId,
                gameweek: row.gameweek,
                expected: expected[field],
                actual: actual[field]
            })
        }
    }
}

const calculateExpectedAvailability = (window) => {
    const minutes = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.minutes) || 0),
        0
    )

    const starts = window.reduce(
        (sum, gameweek) => sum + (Number(gameweek.starts) || 0),
        0
    )

    const appearances = window.filter(
        (gameweek) => (Number(gameweek.minutes) || 0) > 0
    ).length

    const gameweeks = window.length

    return {
        gameweeks,
        minutes,
        starts,
        appearances,
        minutesPerGame:
            gameweeks > 0
                ? Number((minutes / gameweeks).toFixed(2))
                : 0,
        startRate:
            gameweeks > 0
                ? Number(((starts / gameweeks) * 100).toFixed(2))
                : 0,
        appearanceRate:
            gameweeks > 0
                ? Number(((appearances / gameweeks) * 100).toFixed(2))
                : 0
    }
}

// Cached between syncs. maxGameweek trims the response to rows up to and including that gameweek.
const getTrainingDataset = async ({ maxGameweek } = {}) => {
    const dataset = await getCachedDataset(buildTrainingDataset)

    if (maxGameweek === undefined) {
        return dataset
    }

    return dataset.filter((row) => row.gameweek <= maxGameweek)
}

module.exports = {
    buildTrainingRow,
    buildTrainingDataset,
    getTrainingDataset
}