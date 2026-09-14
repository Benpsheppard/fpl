// teamModel.js

const mongoose = require('mongoose')

const teamSchema = mongoose.Schema({
    // Identification
    fplId: {
        type: Number,
        required: [true, 'Missing fplId'],
        unique: true
    },

    code: { type: Number },
    pulseId: { type: Number },

    // Basic Info
    name: {
        type: String,
        required: [true, 'Missing team name']
    },

    shortName: {
        type: String,
        required: [true, 'Missing short name']
    },

    // League Position / Results
    position: { type: Number },
    played: { type: Number },
    win: { type: Number },
    draw: { type: Number },
    loss: { type: Number },
    points: { type: Number },

    // Form
    form: { type: Number },

    // Team Strength
    strength: { type: Number },

    strengthOverallHome: { type: Number },
    strengthOverallAway: { type: Number },

    strengthAttackHome: { type: Number },
    strengthAttackAway: { type: Number },

    strengthDefenceHome: { type: Number },
    strengthDefenceAway: { type: Number },

    // Availability
    unavailable: { type: Boolean },

    // Additional FPL data
    teamDivision: { type: String },
    linkUrl: { type: String },

    // Metadata
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
})

module.exports = mongoose.model("Team", teamSchema)