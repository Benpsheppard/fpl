// managerService.js

const Manager = require("../models/managerModel")
const ManagerGameweek = require("../models/managerGameweekModel")
const Player = require("../models/playerModel")

const getManagerSquad = async (managerId, gameweek) => {
    const manager = await Manager.findOne({ fplId: Number(managerId) }).lean()
    if (!manager) {
        throw new Error("Manager not found")
    }

    const managerGameweek = await ManagerGameweek.findOne({ managerId: Number(managerId), gameweek: Number(gameweek) })
    if(!managerGameweek) {
        throw new Error("Manager gameweek data not found")
    }

    const playerIds = managerGameweek.picks.map((pick) => pick.element)
    const players = await Player.find({ fplId: { $in: playerIds } }).lean()
    const playerMap = new Map(
        players.map((player) => [
            player.fplId,
            player
        ])
    )

    const squad = managerGameweek.picks.map((pick) => ({
        ...pick,
        player: playerMap.get(pick.element) || null
    }))

    return {
        manager: {
            fplId: manager.fplId,
            name: manager.name,
            firstName: manager.playerFirstName,
            lastName: manager.playerLastName
        },

        gameweek: {
            gameweek: managerGameweek.gameweek,
            points: managerGameweek.points,
            totalPoints: managerGameweek.totalPoints,
            rank: managerGameweek.rank,
            overallRank: managerGameweek.overallRank,
            bank: managerGameweek.bank,
            value: managerGameweek.value,
            eventTransfers: managerGameweek.eventTransfers,
            eventTransfersCost:
                managerGameweek.eventTransfersCost,
            pointsOnBench:
                managerGameweek.pointsOnBench
        },

        activeChip: managerGameweek.activeChip,

        automaticSubs:
            managerGameweek.automaticSubs,

        squad
    }
}

module.exports = {
    getManagerSquad
}