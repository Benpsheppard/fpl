// playerGameweekModel.js

const mongoose = require("mongoose")

const playerGameweekSchema = mongoose.Schema(
    {
        // Player / gameweek identity
        playerId: {
            type: Number,
            required: true,
            index: true
        },

        gameweek: {
            type: Number,
            required: true
        },

        fixtureId: {
            type: Number,
            required: true,
            index: true
        },

        opponentTeam: {
            type: Number,
            required: true,
            index: true
        },

        wasHome: {
            type: Boolean,
            required: true
        },

        kickoffTime: {
            type: Date
        },

        // Fixture result
        homeTeamScore: { type: Number },
        awayTeamScore: { type: Number },

        // Player performance
        totalPoints: { type: Number },
        minutes: { type: Number },

        goalsScored: { type: Number },
        assists: { type: Number },

        cleanSheets: { type: Number },
        goalsConceded: { type: Number },
        ownGoals: { type: Number },

        penaltiesSaved: { type: Number },
        penaltiesMissed: { type: Number },

        yellowCards: { type: Number },
        redCards: { type: Number },

        saves: { type: Number },

        // FPL scoring / performance
        bonus: { type: Number },
        bps: { type: Number },

        influence: { type: Number },
        creativity: { type: Number },
        threat: { type: Number },
        ictIndex: { type: Number },

        // Defensive contribution
        clearancesBlocksInterceptions: {
            type: Number
        },

        recoveries: {
            type: Number
        },

        tackles: {
            type: Number
        },

        defensiveContribution: {
            type: Number
        },

        starts: {
            type: Number
        },

        // Expected statistics
        expectedGoals: {
            type: Number
        },

        expectedAssists: {
            type: Number
        },

        expectedGoalInvolvements: {
            type: Number
        },

        expectedGoalsConceded: {
            type: Number
        },

        // Price / ownership at that point
        value: {
            type: Number
        },

        transfersBalance: {
            type: Number
        },

        selected: {
            type: Number
        },

        transfersIn: {
            type: Number
        },

        transfersOut: {
            type: Number
        }
    },
    {
        timestamps: true
    }
)

// One player can only have one record for a fixture/gameweek
playerGameweekSchema.index(
    {
        playerId: 1,
        gameweek: 1
    },
    {
        unique: true
    }
)

module.exports = mongoose.model( "PlayerGameweek", playerGameweekSchema )