// squad.js

import { getFlag } from "./flags"

const POSITION_ORDER = [1, 2, 3, 4]

export const POSITION_NAMES = { 1: "Goalkeepers", 2: "Defenders", 3: "Midfielders", 4: "Forwards" }
export const POSITION_SHORT = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" }

// Combine the user's squad (sell prices, from Node) with the model's predictions (from Python).
// A player with no prediction (no upcoming fixture) is kept, with no expected points.
export const joinSquad = (team, predictions) => {
    const byId = new Map(predictions.map((prediction) => [prediction.playerId, prediction]))

    return team.squad.map((owned) => {
        const prediction = byId.get(owned.playerId)

        // FPL's own status and news cover a player the model has no row for
        const merged = {
            ...(prediction ?? {}),
            ...owned,
            // `position` means the squad slot (1-15) on an owned player but the kind of player (1-4) on a
            // prediction. Keep both, under names that can't be confused.
            slot: owned.position,
            position: owned.elementType,
            price: prediction?.price ?? owned.nowPrice,
            status: owned.status,
            news: owned.news || prediction?.news || "",
            expected_points: prediction?.expected_points,
            name: owned.webName ?? prediction?.name,
        }

        return { ...merged, flag: getFlag(prediction ? merged : null) }
    })
}

export const groupByPosition = (players) => POSITION_ORDER
    .map((elementType) => ({
        elementType,
        name: POSITION_NAMES[elementType],
        players: players.filter((player) => player.elementType === elementType),
    }))
    .filter((group) => group.players.length > 0)
