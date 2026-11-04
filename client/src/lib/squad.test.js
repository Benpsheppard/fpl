import { describe, expect, it } from "vitest"
import { groupByPosition, joinSquad } from "./squad"
import { myTeam, ownedPlayer, prediction, withAvailability } from "../test/fixtures"

describe("joinSquad", () => {
    it("adds the model's numbers to each owned player", () => {
        const team = myTeam([ownedPlayer({ playerId: 5, webName: "Raya", elementType: 1, team: 1, sellPrice: 6.1 })])
        const predictions = [prediction({ playerId: 5, name: "Raya", position: 1, price: 6.2, expected_points: 5.1 })]

        const [player] = joinSquad(team, predictions)

        expect(player.expected_points).toBe(5.1)
        expect(player.sellPrice).toBe(6.1)
        expect(player.price).toBe(6.2)
        expect(player.name).toBe("Raya")
    })

    it("keeps the squad slot and the kind of player apart", () => {
        // Both use the word `position` but mean different things
        const team = myTeam([ownedPlayer({ playerId: 5, position: 14, elementType: 2 })])

        const [player] = joinSquad(team, [prediction({ playerId: 5, position: 2 })])

        expect(player.slot).toBe(14)
        expect(player.position).toBe(2)
    })

    it("keeps a player the model has no row for, with no expected points", () => {
        const team = myTeam([ownedPlayer({ playerId: 9, webName: "Benchwarmer", nowPrice: 4.0 })])

        const [player] = joinSquad(team, [])

        expect(player.expected_points).toBeUndefined()
        expect(player.name).toBe("Benchwarmer")
        expect(player.price).toBe(4.0)
        expect(player.flag.level).toBe("blank")
    })

    it("flags an injured owned player as out", () => {
        const team = myTeam([ownedPlayer({ playerId: 5, status: "i", news: "Hamstring injury" })])
        const predictions = [withAvailability("i", 0, { playerId: 5, news: "Hamstring injury", expected_points: 0 })]

        const [player] = joinSquad(team, predictions)

        expect(player.flag.level).toBe("out")
        expect(player.news).toBe("Hamstring injury")
    })

    it("uses FPL's news from your team when the prediction has none", () => {
        const team = myTeam([ownedPlayer({ playerId: 5, news: "Back from suspension" })])

        const [player] = joinSquad(team, [prediction({ playerId: 5, news: "" })])

        expect(player.news).toBe("Back from suspension")
    })

    it("ignores predictions for players you do not own", () => {
        const team = myTeam([ownedPlayer({ playerId: 5 })])

        expect(joinSquad(team, [prediction({ playerId: 5 }), prediction({ playerId: 6 })])).toHaveLength(1)
    })
})

describe("groupByPosition", () => {
    it("orders goalkeepers, defenders, midfielders, forwards and names them", () => {
        const players = [
            { playerId: 1, elementType: 4 },
            { playerId: 2, elementType: 1 },
            { playerId: 3, elementType: 3 },
            { playerId: 4, elementType: 2 },
            { playerId: 5, elementType: 2 },
        ]

        const groups = groupByPosition(players)

        expect(groups.map((group) => group.name)).toEqual(["Goalkeepers", "Defenders", "Midfielders", "Forwards"])
        expect(groups[1].players.map((player) => player.playerId)).toEqual([4, 5])
    })

    it("leaves out positions nobody plays", () => {
        expect(groupByPosition([{ playerId: 1, elementType: 1 }]).map((group) => group.elementType)).toEqual([1])
    })
})
