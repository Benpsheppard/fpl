// managerGameweekModel.js

const mongoose = require("mongoose")

const managerPickSchema = mongoose.Schema(
    {
        element: {
            type: Number,
            required: true
        },

        position: {
            type: Number,
            required: true
        },

        multiplier: {
            type: Number,
            required: true
        },

        isCaptain: {
            type: Boolean,
            required: true
        },

        isViceCaptain: {
            type: Boolean,
            required: true
        },

        elementType: {
            type: Number,
            required: true
        }
    },
    {
        _id: false
    }
)

const managerGameweekSchema = mongoose.Schema(
    {
        managerId: {
            type: Number,
            required: true,
        },

        gameweek: {
            type: Number,
            required: true,
        },

        // Chips
        activeChip: {
            type: String,
            default: null
        },

        // Automatic substitutions
        automaticSubs: [
            {
                type: mongoose.Schema.Types.Mixed
            }
        ],

        // Manager's 15 players
        picks: {
            type: [managerPickSchema],
            required: true
        },

        // GW performance
        points: {
            type: Number
        },

        totalPoints: {
            type: Number
        },

        rank: {
            type: Number
        },

        rankSort: {
            type: Number
        },

        overallRank: {
            type: Number
        },

        percentileRank: {
            type: Number
        },

        overallRankPercentage: {
            type: String
        },

        bank: {
            type: Number
        },

        value: {
            type: Number
        },

        eventTransfers: {
            type: Number
        },

        eventTransfersCost: {
            type: Number
        },

        pointsOnBench: {
            type: Number
        }
    },
    {
        timestamps: true
    }
)

managerGameweekSchema.index(
    { managerId: 1, gameweek: 1 },
    { unique: true }
)

module.exports = mongoose.model(
    "ManagerGameweek",
    managerGameweekSchema
)