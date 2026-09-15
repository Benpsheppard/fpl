const mongoose = require("mongoose")

const managerSchema = mongoose.Schema(
    {
        fplId: {
            type: Number,
            required: [true, "Missing manager fplId"],
            unique: true,
            index: true
        },

        // Profile
        playerFirstName: { type: String },
        playerLastName: { type: String },

        name: { type: String },

        playerRegionId: { type: Number },
        playerRegionName: { type: String },
        playerRegionIsoCodeShort: { type: String },
        playerRegionIsoCodeLong: { type: String },

        favouriteTeam: { type: Number },

        joinedTime: { type: Date },
        startedEvent: { type: Number },
        yearsActive: { type: Number },

        // Current season summary
        currentEvent: { type: Number },

        summaryOverallPoints: { type: Number },
        summaryOverallRank: { type: Number },

        summaryEventPoints: { type: Number },
        summaryEventRank: { type: Number },

        // Last deadline state
        lastDeadlineBank: { type: Number },
        lastDeadlineValue: { type: Number },
        lastDeadlineTotalTransfers: { type: Number },

        // Events played/entered
        enteredEvents: [{ type: Number }],

        // Misc
        nameChangeBlocked: { type: Boolean },
        kit: { type: mongoose.Schema.Types.Mixed },
        clubBadgeSrc: { type: String },

        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model("Manager", managerSchema)