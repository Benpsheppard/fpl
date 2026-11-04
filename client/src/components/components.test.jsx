import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import AppearanceBar from "./AppearanceBar"
import FixtureLegend from "./FixtureLegend"
import FixtureRun from "./FixtureRun"
import FlagBadge from "./FlagBadge"
import MyTeam from "./MyTeam"
import PlayerCell from "./PlayerCell"
import PlayerPicker from "./PlayerPicker"
import TransferSuggestions from "./TransferSuggestions"
import WarningsBanner from "./WarningsBanner"
import { getFlag } from "../lib/flags"
import { joinSquad } from "../lib/squad"
import { bestSwapByPlayer, suggestSwaps } from "../lib/transfers"
import { clubsMap, fixtureRun, myTeam, ownedPlayer, prediction, withAvailability } from "../test/fixtures"

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

    describe("a player in the list", () => {
        const stackFor = (name) => screen.getByText(name).closest(".player-stack")
        const lines = (stack) => [...stack.children].map((line) => line.textContent)

        it("shows the name, then the club and position, then the warning tag", () => {
            const flagged = [
                withAvailability("d", 0.5, { playerId: 9, name: "Doubtful", position: 3, team: 2, price: 6, expected_points: 3 }),
                ...players,
            ]
            render(<PlayerPicker players={flagged} teams={teams} ownedIds={new Set()} />)

            expect(lines(stackFor("Doubtful"))).toEqual(["Doubtful", "AVL · MID", "Doubtful 50%"])
        })

        it("has only two lines for a fit player", () => {
            renderPicker()

            expect(lines(stackFor("Raya"))).toEqual(["Raya", "ARS · GK"])
        })

        it("is the row's header, so screen readers announce the player for each cell", () => {
            renderPicker()

            expect(stackFor("Raya").closest("th")).toHaveAttribute("scope", "row")
        })
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

describe("PlayerCell", () => {
    const clubNames = new Map([[1, "ARS"]])
    const lines = (container) => [...container.querySelector(".player-stack").children].map((line) => line.textContent)

    it("stacks the name, then the club and position, then the warning tag", () => {
        const player = prediction({ name: "Saka", team: 1, position: 3 })

        const { container } = render(<PlayerCell player={player} flag={getFlag(withAvailability("i", 0))} teamNames={clubNames} />)

        expect(lines(container)).toEqual(["Saka", "ARS · MID", "Out"])
    })

    it("has no third line for a fit player", () => {
        const { container } = render(<PlayerCell player={prediction({ name: "Raya", team: 1, position: 1 })} flag={getFlag(prediction())} teamNames={clubNames} />)

        expect(lines(container)).toEqual(["Raya", "ARS · GK"])
    })

    it("reads the position from either field a player might carry it in", () => {
        const flag = { level: "ok" }

        const fromPosition = render(<PlayerCell player={{ name: "A", team: 1, position: 4 }} flag={flag} teamNames={clubNames} />)
        expect(lines(fromPosition.container)).toEqual(["A", "ARS · FWD"])
        fromPosition.unmount()

        const fromElementType = render(<PlayerCell player={{ name: "B", team: 1, elementType: 2 }} flag={flag} teamNames={clubNames} />)
        expect(lines(fromElementType.container)).toEqual(["B", "ARS · DEF"])
    })

    it("shows captain and vice-captain badges with the name", () => {
        const flag = { level: "ok" }

        const { container } = render(<PlayerCell player={{ name: "Haaland", team: 1, position: 4, isCaptain: true }} flag={flag} teamNames={clubNames} />)

        expect(lines(container)[0]).toBe("HaalandC")
        expect(screen.getByTitle("Captain")).toBeInTheDocument()
    })

    it("shows a very long name whole, as one line", () => {
        const name = "Calvert-Lewin-Featherstonehaugh-Cholmondeley"

        const { container } = render(<PlayerCell player={{ name, team: 1, position: 4 }} flag={{ level: "ok" }} teamNames={clubNames} />)

        expect(lines(container)[0]).toBe(name)
    })

    it("does not show a stray separator when the club is unknown", () => {
        const { container } = render(<PlayerCell player={{ name: "Mystery", team: 99, position: 1 }} flag={{ level: "ok" }} teamNames={clubNames} />)

        expect(lines(container)).toEqual(["Mystery", "GK"])
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

    describe("a player in the squad list", () => {
        // The cell is a stack of lines: name, then club and position, then any warning tag
        const stackOf = (name) => screen.getByText(name).closest(".player-stack")
        const lines = (stack) => [...stack.children].map((line) => line.textContent)

        it("shows the name, then the club and position below it, then the warning tag below that", () => {
            setup()

            expect(lines(stackOf("Saka"))).toEqual(["Saka", "ARS · MID", "Out"])
        })

        it("has only two lines for a fit player, with no empty space where a tag would be", () => {
            setup()

            expect(lines(stackOf("Jackson"))).toEqual(["Jackson", "AVL · FWD"])
        })

        it("keeps the captain's armband on the name line", () => {
            setup()

            const [nameLine, metaLine] = stackOf("Raya").children
            expect(within(nameLine).getByTitle("Captain")).toBeInTheDocument()
            expect(metaLine).not.toHaveTextContent("C")
            expect(lines(stackOf("Raya"))).toEqual(["RayaC", "ARS · GK"])
        })

        it("puts the tag in the same place whatever kind of warning it is", () => {
            const team = myTeam([ownedPlayer({ playerId: 1, webName: "Doubt", elementType: 2, team: 2, position: 2 })])
            const squad = joinSquad(team, [withAvailability("d", 0.5, { playerId: 1, name: "Doubt", position: 2, team: 2, news: "Knock" })])

            render(<MyTeam team={team} squad={squad} teamNames={names} clubs={clubsMap()} bestSwaps={new Map()} freeTransfers={1} onFreeTransfersChange={() => {}} />)

            expect(lines(stackOf("Doubt"))).toEqual(["Doubt", "AVL · DEF", "Doubtful 50%"])
            expect(screen.getByText("Doubtful 50%")).toHaveAttribute("title", "Knock")
        })

        it("shows just the position when the club is unknown, with no stray separator", () => {
            const team = myTeam([ownedPlayer({ playerId: 1, webName: "Mystery", elementType: 1, team: 99, position: 1 })])

            render(<MyTeam team={team} squad={joinSquad(team, [])} teamNames={new Map()} clubs={clubsMap()} bestSwaps={new Map()} freeTransfers={1} onFreeTransfersChange={() => {}} />)

            expect(lines(stackOf("Mystery")).slice(0, 2)).toEqual(["Mystery", "GK"])
        })

        it("is still the row's header, so screen readers announce the player for each cell", () => {
            setup()

            expect(stackOf("Saka").closest("th")).toHaveAttribute("scope", "row")
        })
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

    it("has no bench section when nobody is on the bench", () => {
        setup()

        expect(screen.queryByText(/^Bench/)).not.toBeInTheDocument()
    })

    describe("the bench section", () => {
        // A full squad: one of each position starts, and one of each is on the bench (slots 12-15, deliberately out of order)
        const full = [
            ownedPlayer({ playerId: 1, webName: "StartGK", elementType: 1, position: 1, team: 1 }),
            ownedPlayer({ playerId: 2, webName: "StartDEF", elementType: 2, position: 2, team: 1 }),
            ownedPlayer({ playerId: 3, webName: "StartMID", elementType: 3, position: 3, team: 2 }),
            ownedPlayer({ playerId: 4, webName: "StartFWD", elementType: 4, position: 4, team: 2 }),
            ownedPlayer({ playerId: 15, webName: "BenchFWD", elementType: 4, position: 15, team: 1 }),
            ownedPlayer({ playerId: 12, webName: "BenchGK", elementType: 1, position: 12, team: 2 }),
            ownedPlayer({ playerId: 14, webName: "BenchMID", elementType: 3, position: 14, team: 1 }),
            ownedPlayer({ playerId: 13, webName: "BenchDEF", elementType: 2, position: 13, team: 2 }),
        ]

        const renderSquad = (owned = full, predictions = [], bestSwaps = new Map()) => {
            const team = myTeam(owned)

            return render(
                <MyTeam team={team} squad={joinSquad(team, predictions)} teamNames={names} clubs={clubs} bestSwaps={bestSwaps} freeTransfers={1} onFreeTransfersChange={() => {}} />,
            )
        }

        const clubs = clubsMap()
        const tables = () => screen.getAllByRole("table")
        const captionOf = (table) => table.querySelector("caption").textContent
        const rowNames = (table) => [...table.querySelectorAll("tbody .player-name")].map((cell) => cell.textContent)

        it("comes after the four position sections", () => {
            renderSquad()

            expect(tables().map((table) => captionOf(table).split(" · ")[0])).toEqual(["Goalkeepers", "Defenders", "Midfielders", "Forwards", "Bench"])
        })

        it("holds only the bench players, in substitution order, whatever their positions", () => {
            renderSquad()

            const bench = tables().at(-1)
            expect(rowNames(bench)).toEqual(["BenchGK", "BenchDEF", "BenchMID", "BenchFWD"])
        })

        it("leaves the bench players out of the position sections", () => {
            renderSquad()

            const [goalkeepers, defenders, midfielders, forwards] = tables()
            expect(rowNames(goalkeepers)).toEqual(["StartGK"])
            expect(rowNames(defenders)).toEqual(["StartDEF"])
            expect(rowNames(midfielders)).toEqual(["StartMID"])
            expect(rowNames(forwards)).toEqual(["StartFWD"])
        })

        it("still says each bench player's position, since the section doesn't", () => {
            renderSquad()

            const rows = [...tables().at(-1).querySelectorAll("tbody tr")]
            expect(rows.map((row) => row.querySelector("th .muted").textContent.split("·")[1].trim())).toEqual(["GK", "DEF", "MID", "FWD"])
        })

        it("explains that bench points only count if they are subbed on", () => {
            renderSquad()

            expect(captionOf(tables().at(-1))).toMatch(/in substitution order; their points only count if they are subbed on/)
        })

        it("drops the old per-player Bench badge now the section says it", () => {
            const { container } = renderSquad()

            expect(container.querySelector(".bench")).toBeNull()
        })

        it("shows the same details for a bench player as for a starter", () => {
            const predictions = [prediction({ playerId: 12, name: "BenchGK", position: 1, expected_points: 0.2, upcoming_fixtures: fixtureRun([[10, 1, true, 5]], { from: 10, to: 10 }) })]
            const swaps = new Map([[12, { in: { name: "Better" }, netGain: 1.7, priority: false }]])

            renderSquad(full, predictions, swaps)

            const row = tables().at(-1).querySelector("tbody tr")
            expect(within(row).getByText("0.2")).toBeInTheDocument()
            expect(within(row).getByText("ARS (H)")).toHaveClass("fixture-hardest")
            expect(within(row).getByText(/→ Better/)).toBeInTheDocument()
        })

        describe("column alignment", () => {
            const colClasses = (table) => [...table.querySelectorAll("colgroup col")].map((col) => col.className)

            it("declares the same columns in every section, so they line up down the page", () => {
                renderSquad()

                const all = tables().map(colClasses)

                expect(all).toHaveLength(5) // four positions and the bench
                for (const columns of all) {
                    expect(columns).toEqual(all[0])
                }
            })

            it("declares one column for each heading, because a missing one would shift every column after it", () => {
                renderSquad()

                for (const table of tables()) {
                    expect(table.querySelectorAll("colgroup col")).toHaveLength(table.querySelectorAll("thead th").length)
                }
            })

            it("names the fixed-width columns and leaves the last to take the rest", () => {
                renderSquad()

                expect(colClasses(tables()[0])).toEqual(["col-player", "col-points", "col-playing", "col-sell", "col-fixtures", ""])
            })

            it("gives the bench the same columns as the starters", () => {
                renderSquad()

                expect(colClasses(tables().at(-1))).toEqual(colClasses(tables()[0]))
            })
        })

        it("omits a position section whose players are all on the bench", () => {
            // The only goalkeeper is a substitute
            renderSquad([
                ownedPlayer({ playerId: 3, webName: "StartMID", elementType: 3, position: 3 }),
                ownedPlayer({ playerId: 12, webName: "BenchGK", elementType: 1, position: 12 }),
            ])

            expect(tables().map((table) => captionOf(table).split(" · ")[0])).toEqual(["Midfielders", "Bench"])
        })

        it("shows nothing for a bench player the model has no row for, rather than failing", () => {
            renderSquad([ownedPlayer({ playerId: 12, webName: "Gone", elementType: 3, position: 13 })], [])

            const row = tables().at(-1).querySelector("tbody tr")
            expect(within(row).getByText("Gone")).toBeInTheDocument()
            expect(row.textContent).toContain("No fixture")
        })

        it("marks a bench player who is out as injured, without urgency", () => {
            const owned = [
                ownedPlayer({ playerId: 3, webName: "StartMID", elementType: 3, position: 3 }),
                ownedPlayer({ playerId: 12, webName: "BenchMID", elementType: 3, position: 12, status: "i", news: "Knee" }),
            ]
            const predictions = [withAvailability("i", 0, { playerId: 12, name: "BenchMID", position: 3, expected_points: 0, news: "Knee" })]

            renderSquad(owned, predictions)

            const row = tables().at(-1).querySelector("tbody tr")
            expect(within(row).getByText("Out")).toBeInTheDocument()
            expect(row).not.toHaveClass("row-priority")
        })
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


describe("FixtureRun", () => {
    const chips = (container) => [...container.querySelectorAll(".fixture")]

    it("shows each opponent with H or A and colours it by difficulty", () => {
        const run = fixtureRun([[10, 1, true, 2], [11, 2, false, 3], [12, 3, true, 5]], { from: 10, to: 12 })

        const { container } = render(<FixtureRun run={run} clubs={clubsMap()} />)

        const [easy, neutral, hardest] = chips(container)
        expect(easy).toHaveTextContent("ARS (H)")
        expect(easy).toHaveClass("fixture-easy")
        expect(neutral).toHaveTextContent("AVL (A)")
        expect(neutral).toHaveClass("fixture-neutral")
        expect(hardest).toHaveTextContent("BOU (H)")
        expect(hardest).toHaveClass("fixture-hardest")
    })

    it.each([
        [1, "fixture-easiest"],
        [2, "fixture-easy"],
        [3, "fixture-neutral"],
        [4, "fixture-hard"],
        [5, "fixture-hardest"],
    ])(
        "colours difficulty %s as %s",
        (difficulty, className) => {
            const { container } = render(<FixtureRun run={fixtureRun([[10, 1, true, difficulty]], { from: 10, to: 10 })} clubs={clubsMap()} />)

            expect(chips(container)[0]).toHaveClass(className)
        },
    )

    it("describes each fixture in words as well as colour", () => {
        render(<FixtureRun run={fixtureRun([[10, 1, false, 5]], { from: 10, to: 10 })} clubs={clubsMap()} />)

        const chip = screen.getByLabelText("Gameweek 10: away at Arsenal, hardest (5 out of 5)")
        expect(chip).toHaveAttribute("title", "Gameweek 10: away at Arsenal, hardest (5 out of 5)")
    })

    it("shows a dash for a gameweek with no fixture, so a blank is visible", () => {
        const { container } = render(<FixtureRun run={fixtureRun([[10, 1, true, 2], [12, 2, true, 3]], { from: 10, to: 12 })} clubs={clubsMap()} />)

        const blank = screen.getByLabelText("Gameweek 11: no fixture")
        expect(blank).toHaveClass("fixture-blank")
        expect(blank).toHaveTextContent("–")
        expect(container.querySelectorAll(".fixture-cell")).toHaveLength(3)
    })

    it("puts a double gameweek's two fixtures in one cell", () => {
        const { container } = render(<FixtureRun run={fixtureRun([[10, 1, true, 2], [10, 3, false, 4]], { from: 10, to: 11 })} clubs={clubsMap()} />)

        const [first, second] = container.querySelectorAll(".fixture-cell")
        expect(first.querySelectorAll(".fixture")).toHaveLength(2)
        expect(second.querySelectorAll(".fixture")).toHaveLength(1) // gameweek 11 is blank
    })

    it("fades a match that has already been played", () => {
        const { container } = render(<FixtureRun run={fixtureRun([[10, 1, true, 2, true]], { from: 10, to: 10 })} clubs={clubsMap()} />)

        expect(chips(container)[0]).toHaveClass("fixture-played")
        expect(screen.getByLabelText(/already played/)).toBeInTheDocument()
    })

    it("falls back to the team number when the club is unknown", () => {
        const { container } = render(<FixtureRun run={fixtureRun([[10, 99, true, 2]], { from: 10, to: 10 })} clubs={clubsMap()} />)

        expect(chips(container)[0]).toHaveTextContent("#99 (H)")
    })

    it("does not colour a fixture whose difficulty is unknown", () => {
        const { container } = render(<FixtureRun run={fixtureRun([[10, 1, true, null]], { from: 10, to: 10 })} clubs={clubsMap()} />)

        expect(chips(container)[0]).toHaveClass("fixture-unknown")
    })

    it.each([[null], [undefined], [{}]])("shows a dash when there is no run (%j)", (run) => {
        const { container } = render(<FixtureRun run={run} clubs={clubsMap()} />)

        expect(container).toHaveTextContent("–")
        expect(container.querySelector(".fixture-run")).toBeNull()
    })

    it("is a list a screen reader can name", () => {
        render(<FixtureRun run={fixtureRun([[10, 1, true, 2]], { from: 10, to: 11 })} clubs={clubsMap()} />)

        expect(screen.getByRole("list", { name: "Upcoming fixtures" })).toBeInTheDocument()
        expect(screen.getAllByRole("listitem")).toHaveLength(2)
    })
})

describe("FixtureLegend", () => {
    it("shows all five ratings, numbered as on FPL's site, each in its own colour", () => {
        render(<FixtureLegend />)

        expect(screen.getByText("1 Easiest")).toHaveClass("fixture-easiest")
        expect(screen.getByText("2 Easy")).toHaveClass("fixture-easy")
        expect(screen.getByText("3 Neutral")).toHaveClass("fixture-neutral")
        expect(screen.getByText("4 Hard")).toHaveClass("fixture-hard")
        expect(screen.getByText("5 Hardest")).toHaveClass("fixture-hardest")
    })

    it("explains H and A", () => {
        render(<FixtureLegend />)

        expect(screen.getByText(/\(H\) home, \(A\) away/)).toBeInTheDocument()
    })
})

describe("fixtures where players are listed", () => {
    const run = (opponent, difficulty) => fixtureRun([[10, opponent, true, difficulty]], { from: 10, to: 10 })
    const clubs = clubsMap()
    const teamList = [...clubs.values()]

    it("appear for every row of the player picker", () => {
        const players = [
            prediction({ playerId: 1, name: "Easy", upcoming_fixtures: run(1, 2) }),
            prediction({ playerId: 2, name: "Hard", upcoming_fixtures: run(2, 5) }),
        ]

        render(<PlayerPicker players={players} teams={teamList} ownedIds={new Set()} />)

        expect(screen.getByRole("columnheader", { name: "Next 5 gameweeks" })).toBeInTheDocument()
        const [easyRow, hardRow] = screen.getAllByRole("row").slice(1)
        expect(within(easyRow).getByText("ARS (H)")).toHaveClass("fixture-easy")
        expect(within(hardRow).getByText("AVL (H)")).toHaveClass("fixture-hardest")
    })

    it("appear for your own players, even a benched one", () => {
        const team = myTeam([ownedPlayer({ playerId: 5, webName: "Austin", elementType: 1, position: 13 })])
        const squad = joinSquad(team, [prediction({ playerId: 5, name: "Austin", position: 1, upcoming_fixtures: run(3, 4) })])

        render(<MyTeam team={team} squad={squad} teamNames={new Map()} clubs={clubs} bestSwaps={new Map()} freeTransfers={1} onFreeTransfersChange={() => {}} />)

        expect(screen.getByText("BOU (H)")).toHaveClass("fixture-hard")
    })

    it("show a dash for a player with no fixtures", () => {
        const team = myTeam([ownedPlayer({ playerId: 5, webName: "Gone", elementType: 3 })])

        render(<MyTeam team={team} squad={joinSquad(team, [])} teamNames={new Map()} clubs={clubs} bestSwaps={new Map()} freeTransfers={1} onFreeTransfersChange={() => {}} />)

        expect(screen.queryByRole("list", { name: "Upcoming fixtures" })).not.toBeInTheDocument()
    })

    it("appear for both players in a swap, so you can compare them", () => {
        const squad = joinSquad(
            myTeam([ownedPlayer({ playerId: 12, webName: "Saka", elementType: 3, team: 1, sellPrice: 8 })]),
            [prediction({ playerId: 12, name: "Saka", position: 3, expected_points: 1, upcoming_fixtures: run(2, 5) })],
        )
        const candidates = [prediction({ playerId: 20, name: "Rice", position: 3, team: 1, price: 7, expected_points: 5, upcoming_fixtures: run(1, 1) })]
        const swaps = suggestSwaps({ squad, candidates, bank: 0, freeTransfers: 1 })

        const { container } = render(<TransferSuggestions swaps={swaps} teamNames={new Map()} clubs={clubs} freeTransfers={1} />)

        // The fixture cells are list items too, so pick out the swap row itself
        const item = container.querySelector(".swap")
        expect(within(item).getByText("AVL (H)")).toHaveClass("fixture-hardest") // Saka's
        expect(within(item).getByText("ARS (H)")).toHaveClass("fixture-easiest") // Rice's
    })
})
