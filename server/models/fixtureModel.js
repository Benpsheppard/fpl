// fixtureModel.js

const mongoose = require("mongoose")

const fixtureStatSchema = mongoose.Schema(
    {
        identifier: {
            type: String,
            required: true
        },

        a: [
            {
                value: {
                    type: Number
                },

                element: {
                    type: Number
                }
            }
        ],

        h: [
            {
                value: {
                    type: Number
                },

                element: {
                    type: Number
                }
            }
        ]
    },
    { _id: false }
)

const fixtureSchema = mongoose.Schema(
    {
        // FPL identifiers
        fplId: {
            type: Number,
            required: true,
            unique: true,
            index: true
        },

        code: {
            type: Number
        },

        pulseId: {
            type: Number
        },

        // Gameweek
        gameweek: {
            type: Number,
            index: true
        },

        // Teams
        homeTeam: {
            type: Number,
            required: true,
            index: true
        },

        awayTeam: {
            type: Number,
            required: true,
            index: true
        },

        // Scores
        homeScore: {
            type: Number
        },

        awayScore: {
            type: Number
        },

        // Fixture difficulty
        homeTeamDifficulty: {
            type: Number
        },

        awayTeamDifficulty: {
            type: Number
        },

        // Fixture status
        finished: {
            type: Boolean
        },

        finishedProvisional: {
            type: Boolean
        },

        started: {
            type: Boolean
        },

        minutes: {
            type: Number
        },

        // Kickoff
        kickoffTime: {
            type: Date
        },

        provisionalStartTime: {
            type: Boolean
        },

        // Player-level fixture statistics
        stats: [fixtureStatSchema],

        // Metadata
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model("Fixture", fixtureSchema)