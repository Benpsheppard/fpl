import AppearanceBar from "./AppearanceBar"
import FixtureRun from "./FixtureRun"
import PlayerCell from "./PlayerCell"
import { groupByPosition, splitStartersAndBench } from "../lib/squad"
import { points, pounds, signed } from "../lib/format"

const MAX_FREE_TRANSFERS = 5

const SquadTable = ({ title, note, players, teamNames, clubs, bestSwaps }) => (
    <div className="table-scroll">
        <table className="squad-table">
            <caption>
                {title}
                {note && <span className="caption-note"> · {note}</span>}
            </caption>
            {/* The same widths in every section (the position groups and the bench), so the columns line up down the page */}
            <colgroup>
                <col className="col-player" />
                <col className="col-points" />
                <col className="col-playing" />
                <col className="col-sell" />
                <col className="col-fixtures" />
                <col />
            </colgroup>
            <thead>
                <tr>
                    <th scope="col">Player</th>
                    <th scope="col" className="num">Exp pts</th>
                    <th scope="col">Playing %</th>
                    <th scope="col" className="num">Sell</th>
                    <th scope="col">Next 5 gameweeks</th>
                    <th scope="col">Suggested swap</th>
                </tr>
            </thead>
            <tbody>
                {players.map((player) => {
                    const swap = bestSwaps.get(player.playerId)

                    return (
                        <tr key={player.playerId} className={swap?.priority ? "row-priority" : undefined}>
                            <th scope="row">
                                <PlayerCell player={player} flag={player.flag} teamNames={teamNames} />
                            </th>
                            <td className="num">{points(player.expected_points)}</td>
                            <td><AppearanceBar probability={player.appearance_probability} /></td>
                            <td className="num">{pounds(player.sellPrice)}</td>
                            <td><FixtureRun run={player.upcoming_fixtures} clubs={clubs} /></td>
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
    </div>
)

const MyTeam = ({ team, squad, teamNames, clubs, bestSwaps, freeTransfers, onFreeTransfersChange }) => {
    const pending = team.pendingTransfers.applied
    const { starters, bench } = splitStartersAndBench(squad)
    const tableProps = { teamNames, clubs, bestSwaps }

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

            {groupByPosition(starters).map((group) => (
                <SquadTable key={group.elementType} title={group.name} players={group.players} {...tableProps} />
            ))}

            {bench.length > 0 && (
                <SquadTable
                    title="Bench"
                    note="in substitution order; their points only count if they are subbed on"
                    players={bench}
                    {...tableProps}
                />
            )}
        </section>
    )
}

export default MyTeam
