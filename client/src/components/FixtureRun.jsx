import { describeFixture, difficultyLevel, fixtureCells } from "../lib/fixtures"

const Chip = ({ fixture, clubs }) => {
    const club = clubs.get(fixture.opponent)
    const description = describeFixture(fixture, clubs)

    return (
        <span
            className={`fixture fixture-${difficultyLevel(fixture.difficulty)}${fixture.played ? " fixture-played" : ""}`}
            title={description}
            aria-label={description}
        >
            {club?.shortName ?? `#${fixture.opponent}`} ({fixture.is_home ? "H" : "A"})
        </span>
    )
}

// The next few gameweeks for one player, coloured easy (green), neutral (grey) or hard (red)
const FixtureRun = ({ run, clubs }) => {
    const cells = fixtureCells(run)

    if (cells.length === 0) {
        return <span className="muted">–</span>
    }

    return (
        <ol className="fixture-run" aria-label="Upcoming fixtures">
            {cells.map((cell) => (
                <li key={cell.gameweek} className="fixture-cell">
                    {cell.fixtures.length === 0
                        ? <span className="fixture fixture-blank" title={`Gameweek ${cell.gameweek}: no fixture`} aria-label={`Gameweek ${cell.gameweek}: no fixture`}>–</span>
                        : cell.fixtures.map((fixture, index) => <Chip key={index} fixture={fixture} clubs={clubs} />)}
                </li>
            ))}
        </ol>
    )
}

export default FixtureRun
