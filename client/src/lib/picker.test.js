import { describe, expect, it } from "vitest"
import { filterAndSort, pointsPerMillion } from "./picker"
import { prediction, withAvailability } from "../test/fixtures"

const players = [
    prediction({ playerId: 1, name: "Haaland", position: 4, team: 15, price: 15.8, expected_points: 6.6 }),
    prediction({ playerId: 2, name: "Rice", position: 3, team: 1, price: 7.4, expected_points: 4.8 }),
    prediction({ playerId: 3, name: "Raya", position: 1, team: 1, price: 6.2, expected_points: 5.1 }),
    prediction({ playerId: 4, name: "Iwobi", position: 3, team: 10, price: 5.4, expected_points: 4.8 }),
    withAvailability("i", 0, { playerId: 5, name: "Saka", position: 3, team: 1, price: 10.5, expected_points: 0 }),
]

const ids = (list) => list.map((player) => player.playerId)

describe("filterAndSort", () => {
    it("never shows players you already own", () => {
        const result = filterAndSort(players, { ownedIds: new Set([1, 3]) })

        expect(ids(result)).not.toContain(1)
        expect(ids(result)).not.toContain(3)
        expect(result).toHaveLength(3)
    })

    it("sorts by expected points, best first, by default", () => {
        // Rice and Iwobi tie on 4.8, so they fall back to alphabetical order
        expect(ids(filterAndSort(players))).toEqual([1, 3, 4, 2, 5])
    })

    it("filters by position", () => {
        expect(ids(filterAndSort(players, { position: 3 }))).toEqual([4, 2, 5])
    })

    it("filters by club", () => {
        expect(ids(filterAndSort(players, { team: 1 }))).toEqual([3, 2, 5])
    })

    it("filters by maximum price, inclusive", () => {
        expect(ids(filterAndSort(players, { maxPrice: 7.4 }))).toEqual([3, 4, 2])
    })

    it("leaves out a player with no known price when a budget is set", () => {
        const withUnknown = [...players, prediction({ playerId: 6, name: "Mystery", price: null, expected_points: 9 })]

        expect(ids(filterAndSort(withUnknown, { maxPrice: 20 }))).not.toContain(6)
        expect(ids(filterAndSort(withUnknown))).toContain(6)
    })

    it("combines filters", () => {
        expect(ids(filterAndSort(players, { position: 3, team: 1, maxPrice: 8 }))).toEqual([2])
    })

    it("hides the flagged levels you ask it to", () => {
        expect(ids(filterAndSort(players, { hideFlags: ["out"] }))).not.toContain(5)
        expect(ids(filterAndSort(players, { hideFlags: [] }))).toContain(5)
    })

    it("searches names without caring about case", () => {
        expect(ids(filterAndSort(players, { search: "hAAl" }))).toEqual([1])
    })

    it("searches the full name too", () => {
        const list = [prediction({ playerId: 9, name: "Saka", fullName: "Bukayo Saka" })]

        expect(ids(filterAndSort(list, { search: "bukayo" }))).toEqual([9])
    })

    it("finds accented and special-letter names with plain letters", () => {
        const list = [
            prediction({ playerId: 7, name: "Groß" }),
            prediction({ playerId: 8, name: "F.Kadıoğlu" }),
            prediction({ playerId: 9, name: "Muñoz" }),
        ]

        expect(ids(filterAndSort(list, { search: "gross" }))).toEqual([7])
        expect(ids(filterAndSort(list, { search: "kadioglu" }))).toEqual([8])
        expect(ids(filterAndSort(list, { search: "munoz" }))).toEqual([9])
    })

    it("ignores a search of only spaces", () => {
        expect(filterAndSort(players, { search: "   " })).toHaveLength(5)
    })

    it("sorts by price, cheapest first when ascending", () => {
        expect(ids(filterAndSort(players, { sortKey: "price", sortDir: "asc" }))).toEqual([4, 3, 2, 5, 1])
    })

    it("sorts by price, dearest first when descending", () => {
        expect(ids(filterAndSort(players, { sortKey: "price", sortDir: "desc" }))[0]).toBe(1)
    })

    it("sorts by the model's chance of playing", () => {
        const list = [
            prediction({ playerId: 1, appearance_probability: 0.3 }),
            prediction({ playerId: 2, appearance_probability: 0.9 }),
        ]

        expect(ids(filterAndSort(list, { sortKey: "appearance" }))).toEqual([2, 1])
    })

    it("sorts by points per million, which favours cheap players", () => {
        // Iwobi 4.8 / 5.4 = 0.89, Rice 4.8 / 7.4 = 0.65, Haaland 6.6 / 15.8 = 0.42
        const result = filterAndSort(players, { sortKey: "value", position: undefined, hideFlags: ["out"] })

        expect(ids(result).slice(0, 3)).toEqual([4, 3, 2])
    })

    it("sorts names alphabetically by default, ignoring accents", () => {
        const list = [prediction({ playerId: 1, name: "Zed" }), prediction({ playerId: 2, name: "Álvaro" })]

        expect(ids(filterAndSort(list, { sortKey: "name" }))).toEqual([2, 1])
    })

    it("breaks ties by expected points and then name, so the order is stable", () => {
        const list = [
            prediction({ playerId: 1, name: "Beta", price: 5, expected_points: 3 }),
            prediction({ playerId: 2, name: "Alpha", price: 5, expected_points: 3 }),
            prediction({ playerId: 3, name: "Gamma", price: 5, expected_points: 4 }),
        ]

        expect(ids(filterAndSort(list, { sortKey: "price" }))).toEqual([3, 2, 1])
    })

    it("does not change the list it is given", () => {
        const copy = [...players]

        filterAndSort(players, { sortKey: "price", sortDir: "asc" })

        expect(players).toEqual(copy)
    })

    it("returns nothing when nothing matches", () => {
        expect(filterAndSort(players, { position: 2 })).toEqual([])
    })
})

describe("pointsPerMillion", () => {
    it("divides expected points by price", () => {
        expect(pointsPerMillion({ expected_points: 6, price: 5 })).toBeCloseTo(1.2)
    })

    it("is zero for a free or unpriced player rather than infinite", () => {
        expect(pointsPerMillion({ expected_points: 6, price: 0 })).toBe(0)
        expect(pointsPerMillion({ expected_points: 6, price: null })).toBe(0)
    })
})
