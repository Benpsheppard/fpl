import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import Home from "./Home"
import { fixtureRun, myTeam, ownedPlayer, prediction, withAvailability } from "../test/fixtures"

const predictions = [
    // Owned
    prediction({ playerId: 1, name: "Raya", position: 1, team: 1, price: 6.2, expected_points: 5.1, upcoming_fixtures: fixtureRun([[10, 10, true, 3]], { from: 10, to: 11 }) }),
    withAvailability("i", 0, { playerId: 12, name: "Saka", position: 3, team: 1, price: 10.5, expected_points: 0, news: "Hamstring injury", appearance_probability: 0.35, upcoming_fixtures: fixtureRun([[10, 15, false, 5]], { from: 10, to: 11 }) }),
    prediction({ playerId: 3, name: "Jackson", position: 4, team: 2, price: 7.0, expected_points: 5.8 }),
    // Could be bought
    prediction({ playerId: 20, name: "Rice", position: 3, team: 1, price: 7.4, expected_points: 4.8, upcoming_fixtures: fixtureRun([[10, 2, true, 2], [11, 10, false, 4]], { from: 10, to: 12 }) }),
    prediction({ playerId: 21, name: "Iwobi", position: 3, team: 10, price: 5.4, expected_points: 4.6 }),
    prediction({ playerId: 22, name: "Haaland", position: 4, team: 15, price: 15.8, expected_points: 6.6 }),
    withAvailability("i", 0, { playerId: 24, name: "Hurt", position: 3, team: 10, price: 5.0, expected_points: 0 }),
]

const squad = [
    ownedPlayer({ playerId: 1, webName: "Raya", elementType: 1, team: 1, position: 1, sellPrice: 6.1 }),
    ownedPlayer({ playerId: 12, webName: "Saka", elementType: 3, team: 1, position: 8, sellPrice: 10.5, status: "i", news: "Hamstring injury" }),
    ownedPlayer({ playerId: 3, webName: "Jackson", elementType: 4, team: 2, position: 10, sellPrice: 6.9 }),
]

const clubs = [
    { fplId: 1, name: "Arsenal", shortName: "ARS" },
    { fplId: 2, name: "Aston Villa", shortName: "AVL" },
    { fplId: 10, name: "Brighton", shortName: "BHA" },
    { fplId: 15, name: "Man City", shortName: "MCI" },
]

// Answer each request by its URL, as the three real services would
const respond = ({ predict, team, teamsResponse } = {}) => {
    const routes = {
        "/predict": predict ?? { body: { players: predictions, warnings: [], data_through_gameweek: 9, model_trained_through_gameweek: 9 } },
        "/api/my-team": team ?? { body: myTeam(squad) },
        "/api/teams": teamsResponse ?? { body: clubs },
    }

    vi.stubGlobal("fetch", vi.fn(async (url) => {
        const match = Object.entries(routes).find(([fragment]) => url.includes(fragment))[1]

        if (match instanceof Error) throw match

        return { ok: (match.status ?? 200) < 400, status: match.status ?? 200, json: async () => match.body }
    }))
}

const pickerRows = () => {
    const picker = screen.getByRole("region", { name: "Players you could buy" })

    return within(picker).queryAllByRole("row").slice(1).map((row) => within(row).getByRole("rowheader").querySelector(".player-name").textContent)
}

beforeEach(() => {
    window.localStorage.clear()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const withOutlooks = (rows) => rows.map((row) => ({
    ...row,
    outlook: { from_gameweek: 10, to_gameweek: 12, gameweeks: [], total_expected_points: row.expected_points * 3 },
}))

describe("Home", () => {
    describe("looking more than one gameweek ahead", () => {
        const body = { players: withOutlooks(predictions), warnings: [], data_through_gameweek: 9, model_trained_through_gameweek: 9, horizon: 3 }
        const predictUrls = () => fetch.mock.calls.map(([url]) => url).filter((url) => url.includes("/predict"))

        it("starts on the next gameweek", async () => {
            respond()
            render(<Home />)

            const button = await screen.findByRole("button", { name: "Next gameweek" })

            expect(button).toHaveAttribute("aria-pressed", "true")
            expect(predictUrls().every((url) => !url.includes("horizon"))).toBe(true)
        })

        it("asks for the longer window and ranks by the totals", async () => {
            respond({ predict: { body } })
            render(<Home />)

            fireEvent.click(await screen.findByRole("button", { name: "3 gameweeks" }))

            await screen.findByText(/Expected points for gameweeks 10 to 12/)
            expect(predictUrls().some((url) => url.endsWith("&horizon=3"))).toBe(true)
            expect(screen.getByRole("button", { name: "3 gameweeks" })).toHaveAttribute("aria-pressed", "true")
            // Haaland: 6.6 a gameweek, 19.8 over three
            const picker = screen.getByRole("region", { name: "Players you could buy" })
            expect(within(picker).getByText("19.8")).toBeInTheDocument()
        })

        it("says there is no track record for the longer view", async () => {
            respond({ predict: { body } })
            render(<Home />)

            fireEvent.click(await screen.findByRole("button", { name: "3 gameweeks" }))

            expect(await screen.findByText(/no track record for these totals/)).toBeInTheDocument()
        })

        it("remembers the choice", async () => {
            respond({ predict: { body } })
            const { unmount } = render(<Home />)
            fireEvent.click(await screen.findByRole("button", { name: "3 gameweeks" }))
            await screen.findByText(/Expected points for gameweeks 10 to 12/)
            unmount()

            render(<Home />)

            expect(await screen.findByRole("button", { name: "3 gameweeks" })).toHaveAttribute("aria-pressed", "true")
        })
    })

    it("shows a loading message, then the page", async () => {
        respond()
        render(<Home />)

        expect(screen.getByRole("status")).toHaveTextContent("Loading predictions")

        expect(await screen.findByRole("heading", { name: "FPL squad picker" })).toBeInTheDocument()
        expect(screen.getByText(/Expected points for gameweek 10/)).toBeInTheDocument()
    })

    it("shows your squad with sell prices, the bank and flags", async () => {
        respond()
        render(<Home />)

        const team = await screen.findByRole("region", { name: "My Team" })

        expect(within(team).getByText("Raya")).toBeInTheDocument()
        expect(within(team).getByText("£6.1m")).toBeInTheDocument()
        expect(within(team).getByText("£1.2m")).toBeInTheDocument()
        expect(within(team).getByText("Out")).toBeInTheDocument()
    })

    it("never lists a player you own as a player you could buy", async () => {
        respond()
        render(<Home />)
        await screen.findByRole("region", { name: "Players you could buy" })

        expect(pickerRows()).not.toContain("Raya")
        expect(pickerRows()).not.toContain("Saka")
        expect(pickerRows()).not.toContain("Jackson")
        expect(pickerRows()).toContain("Haaland")
    })

    it("shows your bench as its own section after the starters", async () => {
        const withBench = [
            ownedPlayer({ playerId: 1, webName: "Raya", elementType: 1, team: 1, position: 1, sellPrice: 6.1 }),
            ownedPlayer({ playerId: 3, webName: "Jackson", elementType: 4, team: 2, position: 10, sellPrice: 6.9 }),
            ownedPlayer({ playerId: 12, webName: "Saka", elementType: 3, team: 1, position: 14, sellPrice: 10.5, status: "i" }),
        ]
        respond({ team: { body: myTeam(withBench) } })
        render(<Home />)

        const team = await screen.findByRole("region", { name: "My Team" })
        const captions = within(team).getAllByRole("table").map((table) => table.querySelector("caption").textContent.split(" · ")[0])

        expect(captions).toEqual(["Goalkeepers", "Forwards", "Bench"])
        const bench = within(team).getAllByRole("table").at(-1)
        expect(within(bench).getByText("Saka")).toBeInTheDocument()
        // The bench player is no longer listed with the midfielders: there is no midfield section at all
        expect(within(team).queryByText("Midfielders")).not.toBeInTheDocument()
    })

    it("recommends replacing the injured player first, with the best affordable option", async () => {
        respond()
        render(<Home />)

        const swaps = await screen.findByRole("region", { name: "Best transfers" })
        const [first] = within(swaps).getAllByRole("listitem")

        expect(within(first).getByText("Saka")).toBeInTheDocument()
        expect(within(first).getByText("Rice")).toBeInTheDocument()
        expect(within(first).getByText("+4.8 pts")).toBeInTheDocument()
        // Haaland is better than Jackson but costs 15.8m against 6.9m sell price + 1.2m in the bank
        expect(within(swaps).queryByText("Haaland")).not.toBeInTheDocument()
    })

    it("lists each player to buy once, even if he could replace several of yours", async () => {
        // Two owned midfielders could both be replaced by Rice
        respond({
            team: { body: myTeam([...squad, ownedPlayer({ playerId: 13, webName: "Weak", elementType: 3, team: 5, position: 6, sellPrice: 6.0 })]) },
            predict: { body: { players: [...predictions, prediction({ playerId: 13, name: "Weak", position: 3, team: 5, price: 6.0, expected_points: 1 })], warnings: [] } },
        })
        render(<Home />)

        const swaps = await screen.findByRole("region", { name: "Best transfers" })
        const bought = within(swaps).getAllByRole("listitem").filter((item) => within(item).queryByText("Rice"))

        expect(bought).toHaveLength(1)
    })

    describe("fixtures", () => {
        it("explains the colours", async () => {
            respond()
            render(<Home />)
            await screen.findByRole("region", { name: "My Team" })

            const key = screen.getByLabelText("Fixture difficulty key")
            expect(within(key).getByText("1 Easiest")).toHaveClass("fixture-easiest")
            expect(within(key).getByText("2 Easy")).toHaveClass("fixture-easy")
            expect(within(key).getByText("3 Neutral")).toHaveClass("fixture-neutral")
            expect(within(key).getByText("4 Hard")).toHaveClass("fixture-hard")
            expect(within(key).getByText("5 Hardest")).toHaveClass("fixture-hardest")
        })

        it("shows a player's upcoming fixtures, coloured, in the list of players to buy", async () => {
            respond()
            render(<Home />)
            const picker = await screen.findByRole("region", { name: "Players you could buy" })

            const rice = within(picker).getByText("Rice").closest("tr")
            expect(within(rice).getByText("AVL (H)")).toHaveClass("fixture-easy")
            expect(within(rice).getByText("BHA (A)")).toHaveClass("fixture-hard")
            // Gameweek 12 has no fixture: a visible gap
            expect(within(rice).getByLabelText("Gameweek 12: no fixture")).toBeInTheDocument()
        })

        it("shows the fixtures of the players you own", async () => {
            respond()
            render(<Home />)
            const team = await screen.findByRole("region", { name: "My Team" })

            const raya = within(team).getByText("Raya").closest("tr")
            expect(within(raya).getByText("BHA (H)")).toHaveClass("fixture-neutral")
            const saka = within(team).getByText("Saka").closest("tr")
            expect(within(saka).getByText("MCI (A)")).toHaveClass("fixture-hardest")
        })

        it("lets you compare the player to sell and the player to buy in a swap", async () => {
            respond()
            render(<Home />)
            const swaps = await screen.findByRole("region", { name: "Best transfers" })

            const [first] = within(swaps).getAllByRole("listitem").filter((item) => item.classList.contains("swap"))
            // Saka's tough away game against the easier home game for Rice
            expect(within(first).getByText("MCI (A)")).toHaveClass("fixture-hardest")
            expect(within(first).getByText("AVL (H)")).toHaveClass("fixture-easy")
        })

        it("still works when the service sends no fixtures at all", async () => {
            respond({ predict: { body: { players: predictions.map((player) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "upcoming_fixtures"))), warnings: [] } } })
            render(<Home />)

            expect(await screen.findByRole("region", { name: "My Team" })).toBeInTheDocument()
            expect(screen.queryByRole("list", { name: "Upcoming fixtures" })).not.toBeInTheDocument()
        })
    })

    it("labels each suggested transfer with how often a swap that size has come off", async () => {
        respond()
        render(<Home />)

        const swaps = await screen.findByRole("region", { name: "Best transfers" })
        const items = within(swaps).getAllByRole("listitem").filter((item) => item.classList.contains("swap"))

        // Saka (0 pts) to Rice (4.8 pts) is a gap of 4.8, the most reliable kind
        expect(within(items[0]).getByText("right 78% of the time")).toHaveClass("reliability-strong")
        for (const item of items) {
            expect(item.querySelector(".reliability")).not.toBeNull()
        }
    })

    it("does not recommend buying the injured player", async () => {
        respond()
        render(<Home />)

        const swaps = await screen.findByRole("region", { name: "Best transfers" })

        expect(within(swaps).queryByText("Hurt")).not.toBeInTheDocument()
    })

    it("adds a transfer hit to every suggestion when you have no free transfer", async () => {
        respond()
        render(<Home />)
        await screen.findByRole("region", { name: "Best transfers" })

        fireEvent.click(screen.getByRole("button", { name: "Fewer free transfers" }))

        const swaps = screen.getByRole("region", { name: "Best transfers" })
        expect(within(swaps).getAllByText("after a 4-point hit").length).toBeGreaterThan(0)
        expect(within(swaps).getByText("+0.8 pts")).toBeInTheDocument()
    })

    it("remembers your free transfers next time", async () => {
        respond()
        const first = render(<Home />)
        await screen.findByRole("region", { name: "My Team" })

        fireEvent.click(screen.getByRole("button", { name: "More free transfers" }))
        expect(screen.getByLabelText("Free transfers")).toHaveTextContent("2")

        first.unmount()
        render(<Home />)
        await screen.findByRole("region", { name: "My Team" })

        expect(screen.getByLabelText("Free transfers")).toHaveTextContent("2")
    })

    it("ignores a nonsense remembered value", async () => {
        window.localStorage.setItem("fpl.freeTransfers", "banana")
        respond()
        render(<Home />)
        await screen.findByRole("region", { name: "My Team" })

        expect(screen.getByLabelText("Free transfers")).toHaveTextContent("1")
    })

    it("still works when the browser won't let it store anything", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
        respond()
        render(<Home />)
        await screen.findByRole("region", { name: "My Team" })

        fireEvent.click(screen.getByRole("button", { name: "More free transfers" }))

        expect(screen.getByLabelText("Free transfers")).toHaveTextContent("2")
    })

    describe("the out-of-date banner", () => {
        it("is not there when everything is current", async () => {
            respond()
            render(<Home />)
            await screen.findByRole("region", { name: "My Team" })

            expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        })

        it("appears when the service reports warnings", async () => {
            respond({
                predict: {
                    body: {
                        players: predictions,
                        warnings: [{ code: "model_stale", message: "The model was trained through gameweek 8, but player data goes to gameweek 9. Retrain the model." }],
                        data_through_gameweek: 9,
                        model_trained_through_gameweek: 8,
                    },
                },
            })
            render(<Home />)

            const banner = await screen.findByRole("alert")

            expect(banner).toHaveTextContent("These predictions may be out of date")
            expect(banner).toHaveTextContent("trained through gameweek 8")
        })
    })

    describe("when something is wrong", () => {
        it("explains an untrained model and lets you try again", async () => {
            respond({ predict: { status: 503, body: { detail: "No trained model found. Train one first." } } })
            render(<Home />)

            const alert = await screen.findByRole("alert")
            expect(alert).toHaveTextContent("hasn't been trained yet")
            expect(alert).toHaveTextContent("npm run refresh")

            // Once it is trained, trying again works
            respond()
            fireEvent.click(screen.getByRole("button", { name: "Try again" }))

            expect(await screen.findByRole("heading", { name: "FPL squad picker" })).toBeInTheDocument()
        })

        it("explains a prediction service that isn't running", async () => {
            respond({ predict: new TypeError("Failed to fetch") })
            render(<Home />)

            expect(await screen.findByRole("alert")).toHaveTextContent(/Can't reach the predictions service/)
        })

        it("still shows the picker when your team can't be loaded, and says why", async () => {
            respond({ team: { status: 503, body: { message: "MY_FPL_MANAGER_ID is not configured on the server" } } })
            render(<Home />)

            expect(await screen.findByRole("region", { name: "Players you could buy" })).toBeInTheDocument()
            expect(screen.getByRole("status")).toHaveTextContent(/Your team isn't shown.*MY_FPL_MANAGER_ID/)
            expect(screen.queryByRole("region", { name: "Best transfers" })).not.toBeInTheDocument()
            // With no team, nobody is excluded
            expect(pickerRows()).toContain("Raya")
        })

        it("still works without the club names", async () => {
            respond({ teamsResponse: { status: 500, body: {} } })
            render(<Home />)

            expect(await screen.findByRole("region", { name: "My Team" })).toBeInTheDocument()
            expect(screen.getByRole("region", { name: "Players you could buy" })).toBeInTheDocument()
        })
    })

    it("refreshes the data on request", async () => {
        respond()
        render(<Home />)
        await screen.findByRole("region", { name: "My Team" })
        const callsBefore = fetch.mock.calls.length

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }))

        await waitFor(() => expect(fetch.mock.calls.length).toBe(callsBefore + 3))
    })
})
