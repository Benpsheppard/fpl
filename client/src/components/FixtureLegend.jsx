import { DIFFICULTY_SCALE } from "../lib/fixtures"

// What the fixture colours mean: FPL's 1-5 rating, easiest to hardest
const FixtureLegend = () => (
    <p className="legend muted" aria-label="Fixture difficulty key">
        Fixtures:
        {DIFFICULTY_SCALE.map(({ rating, level, label }) => (
            <span key={rating} className={`fixture fixture-${level}`}>{rating} {label}</span>
        ))}
        <span>(H) home, (A) away</span>
    </p>
)

export default FixtureLegend
