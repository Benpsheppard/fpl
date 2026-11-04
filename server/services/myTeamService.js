// myTeamService.js
//
// A manager's current squad with what each player could be sold for. Prices are
// handled in tenths of a million (as FPL stores them) and returned in millions.

const Player = require("../models/playerModel")
const fplService = require("./fplService")

// FPL keeps half of any rise (rounded down to 0.1m) and returns the whole of any fall
const computeSellPrice = (purchasePrice, nowPrice) => {
    if (nowPrice > purchasePrice) {
        return purchasePrice + Math.floor((nowPrice - purchasePrice) / 2)
    }

    return nowPrice
}

// What the manager paid: the latest transfer in for that player, else the price at the start of the season
const resolvePurchasePrice = (player, transfers) => {
    const boughtIn = transfers
        .filter((transfer) => transfer.element_in === player.fplId)
        .sort((a, b) => new Date(b.time) - new Date(a.time))

    if (boughtIn.length > 0) {
        return boughtIn[0].element_in_cost
    }

    return player.nowCost - (player.costChangeStart || 0)
}

// Transfers made after the picks were locked in are not in the picks yet. Apply them in the
// order they were made, ignoring any that don't match the squad rather than guessing.
const applyPendingTransfers = (picks, bank, transfers, afterEvent) => {
    const pending = transfers
        .filter((transfer) => transfer.event > afterEvent)
        .sort((a, b) => new Date(a.time) - new Date(b.time))

    let squad = picks.map((pick) => ({ ...pick }))
    let currentBank = bank
    let applied = 0
    let ignored = 0

    for (const transfer of pending) {
        const slot = squad.find((pick) => pick.element === transfer.element_out)

        if (!slot) {
            ignored++
            continue
        }

        // The incoming player takes the slot but not the armband
        slot.element = transfer.element_in
        slot.is_captain = false
        slot.is_vice_captain = false
        currentBank += transfer.element_out_cost - transfer.element_in_cost
        applied++
    }

    return { picks: squad, bank: currentBank, applied, ignored }
}

const toMillions = (tenths) => (tenths === null || tenths === undefined ? null : tenths / 10)

const getMyTeam = async (managerId, { fpl = fplService, PlayerModel = Player } = {}) => {
    const [ manager, transfers ] = await Promise.all([
        fpl.getManager(managerId),
        fpl.getManagerTransfers(managerId)
    ])

    const currentEvent = manager.current_event

    let picksEvent = currentEvent
    let picksData = await fpl.getManagerGameweek(managerId, picksEvent)

    // A Free Hit squad lasts one gameweek and then reverts, so the real team is the one before it
    const onFreeHit = picksData.active_chip === "freehit" && currentEvent > 1
    if (onFreeHit) {
        picksEvent = currentEvent - 1
        picksData = await fpl.getManagerGameweek(managerId, picksEvent)
    }

    const pending = applyPendingTransfers(
        picksData.picks,
        picksData.entry_history.bank,
        transfers,
        // Transfers up to and including the Free Hit week were reverted with it
        onFreeHit ? currentEvent : picksEvent
    )

    const players = await PlayerModel.find({ fplId: { $in: pending.picks.map((pick) => pick.element) } }).lean()
    const playersById = new Map(players.map((player) => [ player.fplId, player ]))

    const squad = pending.picks.map((pick) => {
        const player = playersById.get(pick.element) || {}
        const nowPrice = player.nowCost
        const purchasePrice = player.fplId === undefined ? null : resolvePurchasePrice(player, transfers)

        return {
            playerId: pick.element,
            position: pick.position,
            isCaptain: Boolean(pick.is_captain),
            isViceCaptain: Boolean(pick.is_vice_captain),
            webName: player.webName ?? null,
            team: player.team ?? null,
            elementType: player.elementType ?? pick.element_type ?? null,
            status: player.status ?? null,
            news: player.news || "",
            nowPrice: toMillions(nowPrice),
            purchasePrice: toMillions(purchasePrice),
            sellPrice: purchasePrice === null || nowPrice === undefined ? null : toMillions(computeSellPrice(purchasePrice, nowPrice))
        }
    })

    const sellTotal = squad.reduce((sum, player) => sum + (player.sellPrice || 0), 0)

    return {
        teamName: manager.name,
        currentGameweek: currentEvent,
        basedOnGameweek: picksEvent,
        activeChip: picksData.active_chip ?? null,
        pendingTransfers: { applied: pending.applied, ignored: pending.ignored },
        bank: toMillions(pending.bank),
        squadValue: Math.round(sellTotal * 10) / 10,
        squad
    }
}

module.exports = {
    computeSellPrice,
    resolvePurchasePrice,
    applyPendingTransfers,
    getMyTeam
}
