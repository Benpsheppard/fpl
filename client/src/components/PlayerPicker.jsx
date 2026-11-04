import { useMemo, useState } from "react"
import AppearanceBar from "./AppearanceBar"
import FixtureRun from "./FixtureRun"
import FlagBadge from "./FlagBadge"
import { getFlag } from "../lib/flags"
import { filterAndSort, pointsPerMillion } from "../lib/picker"
import { points, pounds } from "../lib/format"
import { POSITION_SHORT } from "../lib/squad"

const PAGE_SIZE = 50

const COLUMNS = [
    { key: "name", label: "Player" },
    { key: "price", label: "Price", numeric: true },
    { key: "expected_points", label: "Exp pts", numeric: true },
    { key: "appearance", label: "Chance of playing" },
    { key: "value", label: "Pts / £m", numeric: true },
]

const PlayerPicker = ({ players, teams, ownedIds }) => {
    const [position, setPosition] = useState("")
    const [team, setTeam] = useState("")
    const [maxPrice, setMaxPrice] = useState("")
    const [search, setSearch] = useState("")
    const [hideOut, setHideOut] = useState(true)
    const [hideRisky, setHideRisky] = useState(false)
    const [sortKey, setSortKey] = useState("expected_points")
    const [sortDir, setSortDir] = useState("desc")
    const [shown, setShown] = useState(PAGE_SIZE)

    const teamNames = useMemo(() => new Map(teams.map((club) => [club.fplId, club.shortName])), [teams])
    const clubs = useMemo(() => new Map(teams.map((club) => [club.fplId, club])), [teams])

    const rows = useMemo(() => filterAndSort(players, {
        position: position === "" ? null : Number(position),
        team: team === "" ? null : Number(team),
        maxPrice: maxPrice === "" || Number.isNaN(Number(maxPrice)) ? null : Number(maxPrice),
        search,
        hideFlags: [
            ...(hideOut ? ["out"] : []),
            ...(hideRisky ? ["doubtful", "rotation"] : []),
        ],
        ownedIds,
        sortKey,
        sortDir,
    }), [players, position, team, maxPrice, search, hideOut, hideRisky, ownedIds, sortKey, sortDir])

    // Changing a filter or sort goes back to the first page
    const change = (setter) => (event) => {
        setter(event.target.type === "checkbox" ? event.target.checked : event.target.value)
        setShown(PAGE_SIZE)
    }

    const sortBy = (key) => {
        setShown(PAGE_SIZE)

        if (key === sortKey) {
            setSortDir(sortDir === "desc" ? "asc" : "desc")
        } else {
            setSortKey(key)
            setSortDir(key === "name" ? "asc" : "desc")
        }
    }

    return (
        <section className="panel" aria-labelledby="picker-title">
            <header className="panel-header">
                <h2 id="picker-title">Players you could buy</h2>
                <p className="muted">Players already in your squad are not shown.</p>
            </header>

            <form className="filters" onSubmit={(event) => event.preventDefault()} aria-label="Filter players">
                <label>Search
                    <input type="search" value={search} onChange={change(setSearch)} placeholder="Name" />
                </label>
                <label>Position
                    <select value={position} onChange={change(setPosition)}>
                        <option value="">All</option>
                        {Object.entries(POSITION_SHORT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label>Club
                    <select value={team} onChange={change(setTeam)}>
                        <option value="">All</option>
                        {teams.map((club) => <option key={club.fplId} value={club.fplId}>{club.name}</option>)}
                    </select>
                </label>
                <label>Max price (£m)
                    <input type="number" min="3.5" step="0.1" value={maxPrice} onChange={change(setMaxPrice)} placeholder="Any" />
                </label>
                <label className="check">
                    <input type="checkbox" checked={hideOut} onChange={change(setHideOut)} /> Hide injured and suspended
                </label>
                <label className="check">
                    <input type="checkbox" checked={hideRisky} onChange={change(setHideRisky)} /> Hide doubtful and rotation risks
                </label>
            </form>

            <p className="muted" aria-live="polite">{rows.length} player{rows.length === 1 ? "" : "s"}</p>

            {rows.length === 0
                ? <p className="empty">No players match these filters.</p>
                : (
                    <>
                        <div className="table-scroll">
                            <table className="picker-table">
                                <thead>
                                    <tr>
                                        {COLUMNS.map((column) => (
                                            <th
                                                key={column.key}
                                                scope="col"
                                                className={column.numeric ? "num" : undefined}
                                                aria-sort={column.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                                            >
                                                <button type="button" className="sort" onClick={() => sortBy(column.key)}>
                                                    {column.label}
                                                    {column.key === sortKey && <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
                                                </button>
                                            </th>
                                        ))}
                                        <th scope="col">Next 5 gameweeks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, shown).map((player) => (
                                        <tr key={player.playerId}>
                                            <th scope="row">
                                                <span className="player-name">{player.name}</span>
                                                <span className="muted"> {teamNames.get(player.team) ?? ""} · {POSITION_SHORT[player.position]}</span>
                                                <FlagBadge flag={getFlag(player)} />
                                            </th>
                                            <td className="num">{pounds(player.price)}</td>
                                            <td className="num">{points(player.expected_points)}</td>
                                            <td><AppearanceBar probability={player.appearance_probability} /></td>
                                            <td className="num">{points(pointsPerMillion(player))}</td>
                                            <td><FixtureRun run={player.upcoming_fixtures} clubs={clubs} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {rows.length > shown && (
                            <button type="button" className="more" onClick={() => setShown(shown + PAGE_SIZE)}>
                                Show more ({rows.length - shown} left)
                            </button>
                        )}
                    </>
                )}
        </section>
    )
}

export default PlayerPicker
