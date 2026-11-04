// picker.js

import { getFlag } from "./flags"

// Lower-case and strip accents so "Gross" finds "Groß" and "Kadioglu" finds "Kadıoğlu"
const normalise = (text) => (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss") // ß
    .replace(/\u0131/g, "i") // dotless i
    .replace(/\u011f/g, "g") // ğ
    .toLowerCase()

export const pointsPerMillion = (player) => (player.price > 0 ? player.expected_points / player.price : 0)

export const SORTS = {
    expected_points: (player) => player.expected_points,
    price: (player) => player.price ?? 0,
    appearance: (player) => player.appearance_probability ?? 0,
    value: pointsPerMillion,
    name: (player) => normalise(player.name),
}

const DEFAULT_DIRECTION = { name: "asc" }

// Filter and sort the players a manager could buy. Owned players are always left out.
export const filterAndSort = (players, {
    position = null,
    team = null,
    maxPrice = null,
    search = "",
    hideFlags = [],
    ownedIds = new Set(),
    sortKey = "expected_points",
    sortDir = DEFAULT_DIRECTION[sortKey] ?? "desc",
} = {}) => {
    const needle = normalise(search.trim())
    const key = SORTS[sortKey] ?? SORTS.expected_points
    const direction = sortDir === "asc" ? 1 : -1

    return players
        .filter((player) => !ownedIds.has(player.playerId))
        .filter((player) => position === null || player.position === position)
        .filter((player) => team === null || player.team === team)
        // A player with no known price can't be said to fit a budget
        .filter((player) => maxPrice === null || (player.price !== null && player.price !== undefined && player.price <= maxPrice))
        .filter((player) => needle === "" || normalise(`${player.name} ${player.fullName ?? ""}`).includes(needle))
        .filter((player) => hideFlags.length === 0 || !hideFlags.includes(getFlag(player).level))
        .sort((a, b) => {
            const first = key(a)
            const second = key(b)

            if (first < second) return -1 * direction
            if (first > second) return 1 * direction

            // Ties: best expected points first, then by name, so the order never jumps around
            return (b.expected_points - a.expected_points) || normalise(a.name).localeCompare(normalise(b.name))
        })
}
