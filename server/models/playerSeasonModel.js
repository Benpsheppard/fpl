const mongoose = require("mongoose")

const playerSeasonSchema = new mongoose.Schema({
	// Identification
	playerId: {
		type: Number,
		required: true,
	},

	seasonName: {
		type: String,
		required: true,
	},

	elementCode: { type: Number, },

	// Costs
	startCost: { type: Number, },
	endCost: { type: Number, },

	// Points / minutes
	totalPoints: { type: Number },
	minutes: { type: Number },

	// Attacking
	goalsScored: { type: Number },
	assists: { type: Number },

	// Defending
	cleanSheets: { type: Number },
	goalsConceded: { type: Number },
	ownGoals: { type: Number },

	clearancesBlocksInterceptions: { type: Number },
	recoveries: { type: Number },
	tackles: { type: Number },
	defensiveContribution: { type: Number },

	// Goalkeeping
	penaltiesSaved: { type: Number },
	penaltiesMissed: { type: Number },

	saves: { type: Number },

	// Discipline
	yellowCards: { type: Number },
	redCards: { type: Number },

	// Bonus Points
	bonus: { type: Number },
	bps: { type: Number },

	// Stats
	influence: { type: Number },
	creativity: { type: Number },
	threat: { type: Number },
	ictIndex: { type: Number },

	// Starts
	starts: { type: Number },

	// Expected stats
	expectedGoals: { type: Number },
	expectedAssists: { type: Number },
	expectedGoalInvolvements: { type: Number },
	expectedGoalsConceded: { type: Number },
},{
	timestamps: true,
})

playerSeasonSchema.index(
    { playerId: 1, seasonName: 1 },
  	{ unique: true }
)

module.exports = mongoose.model("PlayerSeason", playerSeasonSchema)