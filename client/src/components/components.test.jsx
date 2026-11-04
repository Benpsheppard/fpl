import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import AppearanceBar from "./AppearanceBar"
import FlagBadge from "./FlagBadge"
import MyTeam from "./MyTeam"
import PlayerPicker from "./PlayerPicker"
import TransferSuggestions from "./TransferSuggestions"
import WarningsBanner from "./WarningsBanner"
import { getFlag } from "../lib/flags"
import { joinSquad } from "../lib/squad"
import { bestSwapByPlayer, suggestSwaps } from "../lib/transfers"
import { myTeam, ownedPlayer, prediction, withAvailability } from "../test/fixtures"

const teams = [
    { fplId: 1, name: "Arsenal", shortName: "ARS" },
    { fplId: 2, name: "Aston Villa", shortName: "AVL" },
]

describe("WarningsBanner", () => {
    it("shows nothing when there are no warnings", () => {
        const { container } = render(<WarningsBanner warnings={[]} dataThrough={9} modelThrough={9} />)

        expect(container).toBeEmptyDOMElement()
    })

    it("shows nothing when warnings are missing altogether", () => {
        const { container } = render(<WarningsBanner />)

        expect(container).toBeEmptyDOMElement()
    })

    it("lists each warning and the gameweeks involved", () => {
        render(
            <WarningsBanner
                warnings={[
                    { code: "data_stale", message: "Fixtures show gameweek 10 has results." },
                    { code: "model_stale", message: "The model was trained through gameweek 8." },
                ]}
                dataThrough={9}
                modelThrough={8}
            />,
        )

        expect(screen.getByRole("alert")).toBeInTheDocument()
        expect(screen.getByText("Fixtures show gameweek 10 has results.")).toBeInTheDocument()
        expect(screen.getByText("The model was trained through gameweek 8.")).toBeInTheDocument()
        expect(screen.getByText(/runs to gameweek 9.*through gameweek 8/)).toBeInTheDocument()
        expect(screen.getByText("npm run refresh")).toBeInTheDocument()
    })
})

describe("FlagBadge", () => {
    it("shows nothing for a fit player", () => {
        const { container } = render(<FlagBadge flag={{ level: "ok", label: "Fit", detail: "" }} />)

        expect(container).toBeEmptyDOMElement()
    })

    it("shows the label with the injury news as a tooltip", () => {
        render(<FlagBadge flag={getFlag(withAvailability("i", 0, { news: "Hamstring injury" }))} />)

        const badge = screen.getByText("Out")
        expect(badge).toHaveClass("flag-out")
        expect(badge).toHaveAttribute("title", "Hamstring injury")
    })
})

describe("AppearanceBar", () => {
    it("shows the percentage", () => {
        render(<AppearanceBar probability={0.87} />)

        expect(screen.getByText("87%")).toBeInTheDocument()
    })

    it.each([
        [0.9, "chance-high"],
        [0.7, "chance-medium"],
        [0.3, "chance-low"],
    ])("colours %s as %s", (probability, className) => {
        const { container } = render(<AppearanceBar probability={probability} />)

        expect(container.querySelector(`.${className}`)).not.toBeNull()
    })

    it("shows a dash when there is no estimate", () => {
        render(<AppearanceBar probability={undefined} />)

        expect(screen.getByText("–")).toBeInTheDocument()
    })
})

describe("PlayerPicker", () => {
    const players = [
        prediction({ playerId: 1, name: "Haaland", position: 4, team: 2, price: 15.8, expected_points: 6.6 }),
        prediction({ playerId: 2, name: "Rice", position: 3, team: 1, price: 7.4, expected_points: 4.8 }),
        prediction({ playerId: 3, name: "Raya", position: 1, team: 1, price: 6.2, expected_points: 5.1 }),
        withAvailability("i", 0, { playerId: 4, name: "Saka", position: 3, team: 1, price: 10.5, expected_points: 0 }),
        prediction({ playerId: 5, name: "Rotator", position: 3, team: 2, price: 5.0, expected_points: 2.0, appearance_probability: 0.3 }),
    ]

    const shownNames = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getByRole("rowheader").querySelector(".player-name").textContent)

    const renderPicker = (props = {}) => render(<PlayerPicker players={players} teams={teams} ownedIds={new Set()} {...props} />)

    it("never shows players you own", () => {
        renderPicker({ ownedIds: new Set([1, 3]) })

        expect(shownNames()).not.toContain("Haaland")
        expect(shownNames()).not.toContain("Raya")
    })

    it("hides injured players until you ask to see them", () => {
        renderPicker()

        expect(shownNames()).not.toContain("Saka")

        fireEvent.click(screen.getByLabelText(/Hide injured/))

        expect(shownNames()).toContain("Saka")
    })

    it("lists the best expected points first", () => {
        renderPicker()

        expect(shownNames()).toEqual(["Haaland", "Raya", "Rice", "Rotator"])
    })

    it("filters by position", () => {
        renderPicker()

        fireEvent.change(screen.getByLabelText("Position"), { target: { value: "3" } })

        expect(shownNames()).toEqual(["Rice", "Rotator"])
    })

    it("offers clubs by full name and filters by the choice", () => {
        renderPicker()

        expect(screen.getByRole("option", { name: "Aston Villa" })).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText("Club"), { target: { value: "2" } })

        expect(shownNames()).toEqual(["Haaland", "Rotator"])
    })

    it("filters by maximum price", () => {
        renderPicker()

        fireEvent.change(screen.getByLabelText(/Max price/), { target: { value: "7" } })

        expect(shownNames()).toEqual(["Raya", "Rotator"])
    })

    it("searches by name", () => {
        renderPicker()

        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "ric" } })

        expect(shownNames()).toEqual(["Rice"])
    })

    it("can hide doubtful players and rotation risks", () => {
        renderPicker()

        expect(shownNames()).toContain("Rotator")

        fireEvent.click(screen.getByLabelText(/Hide doubtful/))

        expect(shownNames()).not.toContain("Rotator")
    })

    it("labels rotation risks so you can see why", () => {
        renderPicker()

        expect(screen.getByText("Rotation risk")).toHaveAttribute("title", "Model gives 30% chance of playing")
    })

    it("sorts by a column when its header is clicked, and reverses on a second click", () => {
        renderPicker()

        fireEvent.click(screen.getByRole("button", { name: /^Price/ }))
        expect(shownNames()).toEqual(["Haaland", "Rice", "Raya", "Rotator"])
        expect(screen.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "descending")

        fireEvent.click(screen.getByRole("button", { name: /^Price/ }))
        expect(shownNames()).toEqual(["Rotator", "Raya", "Rice", "Haaland"])
        expect(screen.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "ascending")
    })

    it("sorts names from A to Z first", () => {
        renderPicker()

        fireEvent.click(screen.getByRole("button", { name: /^Player/ }))

        expect(shownNames()).toEqual(["Haaland", "Raya", "Rice", "Rotator"])
    })

    it("says how many players match", () => {
        renderPicker()

        expect(screen.getByText("4 players")).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "ric" } })

        expect(screen.getByText("1 player")).toBeInTheDocument()
    })

    it("explains when nothing matches", () => {
        renderPicker()

        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } })

        expect(screen.getByText("No players match these filters.")).toBeInTheDocument()
        expect(screen.queryByRole("table")).not.toBeInTheDocument()
    })

    it("shows players in pages of 50", () => {
        const many = Array.from({ length: 120 }, (_, i) => prediction({ playerId: 1000 + i, name: `P${String(i).padStart(3, "0")}`, expected_points: 200 - i }))

        render(<PlayerPicker players={many} teams={teams} ownedIds={new Set()} />)

        expect(screen.getAllByRole("row")).toHaveLength(51)

        fireEvent.click(screen.getByRole("button", { name: "Show more (70 left)" }))
        expect(screen.getAllByRole("row")).toHaveLength(101)

        fireEvent.click(screen.getByRole("button", { name: "Show more (20 left)" }))
        expect(screen.getAllByRole("row")).toHaveLength(121)
        expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument()
    })

    it("goes back to the first page when a filter changes", () => {
        const many = Array.from({ length: 120 }, (_, i) => prediction({ playerId: 1000 + i, name: `P${i}`, expected_points: 200 - i }))
        render(<PlayerPicker players={many} teams={teams} ownedIds={new Set()} />)

        fireEvent.click(screen.getByRole("button", { name: /Show more/ }))
        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "P" } })

        expect(screen.getAllByRole("row")).toHaveLength(51)
    })
})

describe("TransferSuggestions", () => {
    const squad = joinSquad(
        myTeam([ownedPlayer({ playerId: 12, webName: "Saka", elementType: 3, team: 1, sellPrice: 10.5, status: "i" })]),
        [withAvailability("i", 0, { playerId: 12, name: "Saka", position: 3, price: 10.5, expected_points: 0 })],
    )
    const candidates = [prediction({ playerId: 20, name: "Rice", position: 3, team: 1, price: 7.4, expected_points: 4.8 })]
    const names = new Map([[1, "ARS"]])

    it("lists what to sell and what to buy, with the gain and the bank left", () => {
        const swaps = suggestSwaps({ squad, candidates, bank: 1.2, freeTransfers: 1 })

        render(<TransferSuggestions swaps={swaps} teamNames={names} freeTransfers={1} />)

        const item = screen.getByRole("listitem")
        expect(within(item).getByText("Saka")).toBeInTheDocument()
        expect(within(item).getByText("Rice")).toBeInTheDocument()
        expect(within(item).getByText("+4.8 pts")).toBeInTheDocument()
        expect(within(item).getByText("bank £4.3m")).toBeInTheDocument()
        expect(within(item).getByText("Out")).toBeInTheDocument()
    })

    it("says when the player being sold is on the bench", () => {
        const bench = joinSquad(
            myTeam([
                ownedPlayer({ playerId: 1, webName: "Starter", elementType: 3, position: 5, team: 1, sellPrice: 6 }),
                ownedPlayer({ playerId: 2, webName: "Backup", elementType: 3, position: 13, team: 2, sellPrice: 4 }),
            ]),
            [prediction({ playerId: 1, name: "Starter", position: 3, expected_points: 3 }), prediction({ playerId: 2, name: "Backup", position: 3, expected_points: 0 })],
        )
        const swaps = suggestSwaps({ squad: bench, candidates: [prediction({ playerId: 30, name: "Star", position: 3, team: 9, price: 4.5, expected_points: 6 })], bank: 1, freeTransfers: 1 })

        render(<TransferSuggestions swaps={swaps} teamNames={names} freeTransfers={1} />)

        const item = screen.getAllByRole("listitem").find((li) => within(li).queryByText("Backup"))
        expect(within(item).getByText("Bench")).toBeInTheDocument()
        // 6 points against the weakest starter's 3, not against the backup's 0
        expect(within(item).getByText("+3.0 pts")).toBeInTheDocument()
    })

    it("mentions the hit when there is no free transfer", () => {
        const swaps = suggestSwaps({ squad, candidates, bank: 1.2, freeTransfers: 0 })

        render(<TransferSuggestions swaps={swaps} teamNames={names} freeTransfers={0} />)

        expect(screen.getByText("after a 4-point hit")).toBeInTheDocument()
        expect(screen.getByText("+0.8 pts")).toBeInTheDocument()
        expect(screen.getByText(/each costs a 4-point hit/)).toBeInTheDocument()
    })

    it("explains when no swap is worth making", () => {
        render(<TransferSuggestions swaps={[]} teamNames={names} freeTransfers={1} />)

        expect(screen.getByText(/No swap is worth making/)).toBeInTheDocument()
        expect(screen.queryByRole("list")).not.toBeInTheDocument()
    })

    it("shows only the best few", () => {
        const swaps = Array.from({ length: 12 }, (_, i) => ({
            out: { playerId: i, name: `Out${i}`, sellPrice: 5, expected_points: 1, flag: { level: "ok" } },
            in: prediction({ playerId: 500 + i, name: `In${i}`, team: 1 }),
            netGain: 3, gain: 3, hitCost: 0, bankAfter: 0, priority: false,
        }))

        render(<TransferSuggestions swaps={swaps} teamNames={names} freeTransfers={1} limit={5} />)

        expect(screen.getAllByRole("listitem")).toHaveLength(5)
    })
})

describe("MyTeam", () => {
    const owned = [
        ownedPlayer({ playerId: 1, webName: "Raya", elementType: 1, team: 1, position: 1, sellPrice: 6.1, isCaptain: true }),
        ownedPlayer({ playerId: 12, webName: "Saka", elementType: 3, team: 1, position: 8, sellPrice: 10.5, status: "i", news: "Hamstring injury" }),
        ownedPlayer({ playerId: 3, webName: "Jackson", elementType: 4, team: 2, position: 10, sellPrice: 6.9 }),
    ]
    const predictions = [
        prediction({ playerId: 1, name: "Raya", position: 1, expected_points: 5.1, appearance_probability: 0.99 }),
        withAvailability("i", 0, { playerId: 12, name: "Saka", position: 3, expected_points: 0, news: "Hamstring injury", appearance_probability: 0.35 }),
        prediction({ playerId: 3, name: "Jackson", position: 4, team: 2, expected_points: 5.8 }),
    ]
    const names = new Map([[1, "ARS"], [2, "AVL"]])

    const setup = (overrides = {}) => {
        const team = myTeam(owned, overrides.team)
        const squad = joinSquad(team, predictions)
        const swaps = suggestSwaps({
            squad,
            candidates: [prediction({ playerId: 20, name: "Rice", position: 3, team: 1, price: 7.4, expected_points: 4.8 })],
            bank: team.bank,
            freeTransfers: 1,
        })
        const onChange = vi.fn()

        render(
            <MyTeam
                team={team}
                squad={squad}
                teamNames={names}
                bestSwaps={bestSwapByPlayer(swaps)}
                freeTransfers={overrides.freeTransfers ?? 1}
                onFreeTransfersChange={onChange}
            />,
        )

        return onChange
    }

    it("shows the team name, the gameweek it is as of, the bank and the value", () => {
        setup()

        expect(screen.getByRole("heading", { name: "My Team" })).toBeInTheDocument()
        expect(screen.getByText("Squad as of gameweek 9")).toBeInTheDocument()
        expect(screen.getByText("£1.2m")).toBeInTheDocument()
        expect(screen.getByText("£99.3m")).toBeInTheDocument()
    })

    it("groups the squad by position", () => {
        setup()

        // Positions nobody in this squad plays (defenders here) are left out
        expect(screen.getAllByRole("table").map((table) => table.querySelector("caption").textContent))
            .toEqual(["Goalkeepers", "Midfielders", "Forwards"])
    })

    it("shows each player's sell price and marks the captain", () => {
        setup()

        expect(screen.getByText("£6.1m")).toBeInTheDocument()
        expect(screen.getByTitle("Captain")).toBeInTheDocument()
    })

    it("flags the injured player with the news and highlights the row", () => {
        setup()

        expect(screen.getByText("Out")).toHaveAttribute("title", "Hamstring injury")
        expect(screen.getByText("Saka").closest("tr")).toHaveClass("row-priority")
    })

    it("suggests a swap for the injured player and says to keep the others", () => {
        setup()

        expect(screen.getByText(/→ Rice/)).toBeInTheDocument()
        expect(screen.getAllByText("Keep")).toHaveLength(2)
    })

    it("mentions pending transfers and a chip", () => {
        setup({ team: { pendingTransfers: { applied: 2, ignored: 0 }, activeChip: "wildcard" } })

        expect(screen.getByText("Squad as of gameweek 9 plus 2 pending transfers (wildcard)")).toBeInTheDocument()
    })

    it("warns when a recent transfer didn't fit the squad", () => {
        setup({ team: { pendingTransfers: { applied: 0, ignored: 1 } } })

        expect(screen.getByText(/1 recent transfer doesn't match this squad and was ignored/)).toBeInTheDocument()
    })

    it("labels bench players, and only them", () => {
        setup()
        expect(screen.queryByText("Bench")).not.toBeInTheDocument()
    })

    it("labels a player in a bench slot", () => {
        const team = myTeam([ownedPlayer({ playerId: 1, webName: "Austin", elementType: 1, position: 13 })])

        render(
            <MyTeam team={team} squad={joinSquad(team, [])} teamNames={names} bestSwaps={new Map()} freeTransfers={1} onFreeTransfersChange={() => {}} />,
        )

        expect(screen.getByText("Bench")).toHaveAttribute("title", expect.stringContaining("only count if they are subbed on"))
    })

    it("changes free transfers with the buttons", () => {
        const onChange = setup({ freeTransfers: 1 })

        fireEvent.click(screen.getByRole("button", { name: "More free transfers" }))
        expect(onChange).toHaveBeenLastCalledWith(2)

        fireEvent.click(screen.getByRole("button", { name: "Fewer free transfers" }))
        expect(onChange).toHaveBeenLastCalledWith(0)
    })

    it("stops at zero and at five free transfers", () => {
        setup({ freeTransfers: 0 })
        expect(screen.getByRole("button", { name: "Fewer free transfers" })).toBeDisabled()
    })

    it("stops at five free transfers", () => {
        setup({ freeTransfers: 5 })
        expect(screen.getByRole("button", { name: "More free transfers" })).toBeDisabled()
    })
})
