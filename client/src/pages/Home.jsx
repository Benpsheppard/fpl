import { useMemo } from "react"
import MyTeam from "../components/MyTeam"
import PlayerPicker from "../components/PlayerPicker"
import TransferSuggestions from "../components/TransferSuggestions"
import FixtureLegend from "../components/FixtureLegend"
import WarningsBanner from "../components/WarningsBanner"
import { useDashboard } from "../hooks/useDashboard"
import { useStoredNumber } from "../hooks/useStoredNumber"
import { joinSquad } from "../lib/squad"
import { describeWindow, forHorizon, HORIZONS } from "../lib/horizon"
import { bestSwapByPlayer, bestSwapPerIncoming, suggestSwaps } from "../lib/transfers"

const NO_PLAYERS = []

const Home = () => {
    const [storedHorizon, setHorizon] = useStoredNumber("fpl.horizon", 1, { min: 1, max: 5 })
    const horizon = HORIZONS.includes(storedHorizon) ? storedHorizon : 1
    const { status, error, data, reload } = useDashboard(horizon)
    const [freeTransfers, setFreeTransfers] = useStoredNumber("fpl.freeTransfers", 1, { min: 0, max: 5 })

    const rawPlayers = data?.predictions.players
    // Each player's expected points become the total over the chosen window
    const players = useMemo(() => (rawPlayers ? forHorizon(rawPlayers, horizon) : NO_PLAYERS), [rawPlayers, horizon])
    const team = data?.team ?? null

    const teamNames = useMemo(
        () => new Map((data?.teams ?? []).map((club) => [club.fplId, club.shortName])),
        [data],
    )

    const clubs = useMemo(
        () => new Map((data?.teams ?? []).map((club) => [club.fplId, club])),
        [data],
    )

    const squad = useMemo(() => (team ? joinSquad(team, players) : NO_PLAYERS), [team, players])
    const ownedIds = useMemo(() => new Set(squad.map((player) => player.playerId)), [squad])

    const swaps = useMemo(() => (
        team
            ? suggestSwaps({
                squad,
                candidates: players.filter((player) => !ownedIds.has(player.playerId)),
                bank: team.bank,
                freeTransfers,
                horizon,
            })
            : NO_PLAYERS
    ), [team, squad, players, ownedIds, freeTransfers, horizon])

    const bestSwaps = useMemo(() => bestSwapByPlayer(swaps), [swaps])
    const distinctSwaps = useMemo(() => bestSwapPerIncoming(swaps), [swaps])

    if (status === "loading" && !data) {
        return <p className="state" role="status">Loading predictions…</p>
    }

    if (status === "error") {
        return (
            <section className="state state-error" role="alert">
                <h1>Couldn't load predictions</h1>
                <p>{error}</p>
                <button type="button" onClick={reload}>Try again</button>
            </section>
        )
    }

    const windowText = describeWindow(players, horizon)

    return (
        <main className="page">
            <header className="page-header">
                <h1>FPL squad picker</h1>
                <p className="muted">
                    {windowText ? `Expected points for ${windowText}` : "Expected points"}
                    {" · "}
                    <button type="button" className="link" onClick={reload} disabled={status === "loading"}>
                        {status === "loading" ? "Refreshing…" : "Refresh"}
                    </button>
                </p>
            </header>

            <div className="horizon" role="group" aria-label="How far ahead to look">
                <span className="muted">Look ahead:</span>
                {HORIZONS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={option === horizon ? "horizon-option horizon-active" : "horizon-option"}
                        aria-pressed={option === horizon}
                        onClick={() => setHorizon(option)}
                    >
                        {option === 1 ? "Next gameweek" : `${option} gameweeks`}
                    </button>
                ))}
            </div>

            <FixtureLegend />

            <WarningsBanner
                warnings={data.predictions.warnings}
                dataThrough={data.predictions.data_through_gameweek}
                modelThrough={data.predictions.model_trained_through_gameweek}
            />

            {data.problems.team && (
                <p className="notice" role="status">
                    Your team isn't shown. {data.problems.team}
                </p>
            )}

            <div className="layout">
                {team && (
                    <div className="column">
                        <TransferSuggestions swaps={distinctSwaps} teamNames={teamNames} clubs={clubs} freeTransfers={freeTransfers} horizon={horizon} />
                        <MyTeam
                            team={team}
                            squad={squad}
                            teamNames={teamNames}
                            clubs={clubs}
                            bestSwaps={bestSwaps}
                            freeTransfers={freeTransfers}
                            onFreeTransfersChange={setFreeTransfers}
                        />
                    </div>
                )}
                <div className="column">
                    <PlayerPicker players={players} teams={data.teams} ownedIds={ownedIds} />
                </div>
            </div>
        </main>
    )
}

export default Home
