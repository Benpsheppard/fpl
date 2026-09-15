// playerModel.js

const mongoose = require('mongoose')

const playerSchema = mongoose.Schema({
    // Identification
    fplId: {
        type: Number,
        required: [true, 'Missing fplId'],
        unique: true
    },

    code: { type: Number },
    optaCode: { type: String },

    // Basic Info
    firstName: { type: String },
    secondName: { type: String },
    webName: { type: String },
    knownName: { type: String },
    
    photo: { type: String },
    birthDate: { type: Date },
    teamJoinDate: { type: Date },

    // FPL Classification
    team: {
        type: Number,
        required: [true, 'Missing team'],
        index: true
    },

    teamCode: { type: Number },

    elementType: {
        type: Number,
        required: [true, 'Missing elementType'],
        index: true
    },

    // Availability
    status: { type: String },
    news: { type: String },
    newsAdded: { type: Date },

    chanceOfPlayingNextRound: { type: Number },
    chanceOfPlayingThisRound: { type: Number },

    // Price / value
    nowCost: { type: Number },
    costChangeEvent: { type: Number },
    costChangeEventFall: { type: Number },
    costChangeStart: { type: Number },
    costChangeStartFall: { type: Number },

    priceChangePercent: { type: Number },
    priceChangeHourlyRate: { type: Number },

    priceChangeProjections: [
        {
            offset: { type: Number },
            projectedPercent: { type: Number },
            likelihood: { type: Number }
        }
    ],

    // Performance
    eventPoints: { type: Number },
    totalPoints: { type: Number },
    pointsPerGame: { type: Number },
    form: { type: Number },

    valueForm: { type: Number },
    valueSeason: { type: Number },

    // Ownership / transfers
    selectedByPercent: { type: Number },

    transfersIn: { type: Number },
    transfersInEvent: { type: Number },
    transfersOut: { type: Number },
    transfersOutEvent: { type: Number },

    // Minutes / starts
    minutes: { type: Number },
    starts: { type: Number },

    // Attacking
    goalsScored: { type: Number },
    assists: { type: Number },

    // Defensive
    cleanSheets: { type: Number },
    goalsConceded: { type: Number },
    ownGoals: { type: Number },

    // Goalkeeper
    penaltiesSaved: { type: Number },
    saves: { type: Number },

    // Discipline
    penaltiesMissed: { type: Number },
    yellowCards: { type: Number },
    redCards: { type: Number },

    // Bonus / BPS
    bonus: { type: Number },
    bps: { type: Number },

    // Underlying statistics
    influence: { type: Number },
    creativity: { type: Number },
    threat: { type: Number },
    ictIndex: { type: Number },

    // Expected data
    expectedGoals: { type: Number },
    expectedAssists: { type: Number },
    expectedGoalInvolvements: { type: Number },
    expectedGoalsConceded: { type: Number },

    // Per 90
    expectedGoalsPer90: { type: Number },
    expectedAssistsPer90: { type: Number },
    expectedGoalInvolvementsPer90: { type: Number },
    expectedGoalsConcededPer90: { type: Number },

    savesPer90: { type: Number },
    goalsConcededPer90: { type: Number },
    startsPer90: { type: Number },
    cleanSheetsPer90: { type: Number },
    defensiveContributionPer90: { type: Number },

    // Defensive contribution
    clearancesBlocksInterceptions: { type: Number },
    recoveries: { type: Number },
    tackles: { type: Number },
    defensiveContribution: { type: Number },

    // Set pieces
    cornersAndIndirectFreeKicksOrder: { type: Number },
    directFreeKicksOrder: { type: Number },
    penaltiesOrder: { type: Number },

    cornersAndIndirectFreeKicksText: { type: String },
    directFreeKicksText: { type: String },
    penaltiesText: { type: String },

    // FPL rankings
    influenceRank: { type: Number },
    influenceRankType: { type: Number },
    creativityRank: { type: Number },
    creativityRankType: { type: Number },
    threatRank: { type: Number },
    threatRankType: { type: Number },
    ictIndexRank: { type: Number },
    ictIndexRankType: { type: Number },

    nowCostRank: { type: Number },
    nowCostRankType: { type: Number },
    formRank: { type: Number },
    formRankType: { type: Number },
    pointsPerGameRank: { type: Number },
    pointsPerGameRankType: { type: Number },
    selectedRank: { type: Number },
    selectedRankType: { type: Number },

    // Expected points
    epNext: { type: Number },
    epThis: { type: Number },

    // Additional information
    region: { type: Number },
    squadNumber: { type: Number },
    hasTemporaryCode: { type: Boolean },

    // Price information
    priceChangeLockedUntil: { type: Date },
    priceChangeCalibrating: { type: Boolean },

    // Flags
    canTransact: { type: Boolean },
    canSelect: { type: Boolean },
    removed: { type: Boolean },
    special: { type: Boolean },
    inDreamteam: { type: Boolean },
    dreamteamCount: { type: Number },

    // Scout information
    scoutRisks: [
        { 
            property: { type: String },
            notes: { type: String },
            gameweek: { type: Number },
            url: { 
                type: String, 
                default: null
            }
        }
    ],
    scoutNewsLink: { type: String },
    
    // Metadata
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
})

module.exports = mongoose.model("Player", playerSchema)