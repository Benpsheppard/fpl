import AppearanceBar from "./AppearanceBar"
import FlagBadge from "./FlagBadge"
import { groupByPosition, POSITION_SHORT } from "../lib/squad"
import { points, pounds, signed } from "../lib/format"
import { FIRST_BENCH_SLOT } from "../lib/transfers"

const MAX_FREE_TRANSFERS = 5

const MyTeam = ({ team, squad, teamNames, bestSwaps, freeTransfers, onFreeTransfersChange }) => {
    const pending = team.pendingTransfers.applied

    return (
        <section className="panel" aria-labelledby="my-team-title">
            <header className="panel-header">
                <h2 id="my-team-title">{team.teamName}</h2>
                <p className="muted">
                    Squad as of gameweek {team.basedOnGameweek}
                    {pending > 0 && ` plus ${pending} pending transfer${pending === 1 ? "" : "s"}`}
                    {team.activeChip && ` (${team.activeChip})`}
                </p>
            </header>

            <dl className="summary">
                <div><dt>Bank</dt><dd>{pounds(team.bank)}</dd></div>
                <div><dt>Squad value</dt><dd>{pounds(team.squadValue)}</dd></div>
                <div>
                    <dt id="free-transfers-label">Free transfers</dt>
                    <dd className="stepper">
                        <button
                            type="button"
                            aria-label="Fewer free transfers"
                            disabled={freeTransfers <= 0}
                            onClick={() => onFreeTransfersChange(freeTransfers - 1)}
                        >−</button>
                        <output aria-labelledby="free-transfers-label">{freeTransfers}</output>
                        <button
                            type="button"
                            aria-label="More free transfers"
                            disabled={freeTransfers >= MAX_FREE_TRANSFERS}
                            onClick={() => onFreeTransfersChange(freeTransfers + 1)}
                        >+</button>
                    </dd>
                </div>
            </dl>

            {team.pendingTransfers.ignored > 0 && (
                <p className="notice">
                    {team.pendingTransfers.ignored} recent transfer{team.pendingTransfers.ignored === 1 ? " doesn't" : "s don't"} match
                    this squad and {team.pendingTransfers.ignored === 1 ? "was" : "were"} ignored.
                </p>
            )}

            {groupByPosition(squad).map((group) => (
                <table key={group.elementType} className="squad-table">
                    <caption>{group.name}</caption>
                    <thead>
                        <tr>
                            <th scope="col">Player</th>
                            <th scope="col" className="num">Exp pts</th>
                            <th scope="col">Chance of playing</th>
                            <th scope="col" className="num">Sell</th>
                            <th scope="col">Suggested swap</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.players.map((player) => {
                            const swap = bestSwaps.get(player.playerId)

                            return (
                                <tr key={player.playerId} className={swap?.priority ? "row-priority" : undefined}>
                                    <th scope="row">
                                        <span className="player-name">{player.name}</span>
                                        {player.isCaptain && <abbr className="armband" title="Captain">C</abbr>}
                                        {player.isViceCaptain && <abbr className="armband" title="Vice-captain">V</abbr>}
                                        <span className="muted"> {teamNames.get(player.team) ?? ""} · {POSITION_SHORT[player.elementType]}</span>
                                        {player.slot >= FIRST_BENCH_SLOT && <span className="bench" title="On the bench: their points only count if they are subbed on">Bench</span>}
                                        <FlagBadge flag={player.flag} />
                                    </th>
                                    <td className="num">{points(player.expected_points)}</td>
                                    <td><AppearanceBar probability={player.appearance_probability} /></td>
                                    <td className="num">{pounds(player.sellPrice)}</td>
                                    <td>
                                        {swap
                                            ? <span className="swap-hint">
                                                → {swap.in.name} <strong>{signed(swap.netGain)}</strong>
                                              </span>
                                            : <span className="muted">Keep</span>}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            ))}
        </section>
    )
}

export default MyTeam
