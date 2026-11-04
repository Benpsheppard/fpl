import { useMemo } from "react"
import MyTeam from "../components/MyTeam"
import PlayerPicker from "../components/PlayerPicker"
import TransferSuggestions from "../components/TransferSuggestions"
import WarningsBanner from "../components/WarningsBanner"
import { useDashboard } from "../hooks/useDashboard"
import { useStoredNumber } from "../hooks/useStoredNumber"
import { joinSquad } from "../lib/squad"
import { bestSwapByPlayer, bestSwapPerIncoming, suggestSwaps } from "../lib/transfers"

const NO_PLAYERS = []

const Home = () => {
    const { status, error, data, reload } = useDashboard()
    const [freeTransfers, setFreeTransfers] = useStoredNumber("fpl.freeTransfers", 1, { min: 0, max: 5 })

    const players = data?.predictions.players ?? NO_PLAYERS
    const team = data?.team ?? null

    const teamNames = useMemo(
        () => new Map((data?.teams ?? []).map((club) => [club.fplId, club.shortName])),
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
            })
            : NO_PLAYERS
    ), [team, squad, players, ownedIds, freeTransfers])

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

    const gameweek = players[0]?.gameweek

    return (
        <main className="page">
            <header className="page-header">
                <h1>FPL squad picker</h1>
                <p className="muted">
                    {gameweek ? `Expected points for gameweek ${gameweek}` : "Expected points"}
                    {" · "}
                    <button type="button" className="link" onClick={reload} disabled={status === "loading"}>
                        {status === "loading" ? "Refreshing…" : "Refresh"}
                    </button>
                </p>
            </header>

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
                        <TransferSuggestions swaps={distinctSwaps} teamNames={teamNames} freeTransfers={freeTransfers} />
                        <MyTeam
                            team={team}
                            squad={squad}
                            teamNames={teamNames}
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
