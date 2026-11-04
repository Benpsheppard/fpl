import { percent } from "../lib/format"
import { ROTATION_THRESHOLD } from "../lib/flags"

// The model's stage-1 chance of the player playing at all
const AppearanceBar = ({ probability }) => {
    if (probability === null || probability === undefined) {
        return <span className="muted">–</span>
    }

    const level = probability >= 0.8 ? "high" : probability >= ROTATION_THRESHOLD ? "medium" : "low"

    return (
        <span className="chance" title="The model's chance of this player playing">
            <span className="chance-track" aria-hidden="true">
                <span className={`chance-fill chance-${level}`} style={{ width: percent(probability) }} />
            </span>
            <span className="chance-value">{percent(probability)}</span>
        </span>
    )
}

export default AppearanceBar
