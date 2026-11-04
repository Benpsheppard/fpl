import FlagBadge from "./FlagBadge"
import { POSITION_SHORT } from "../lib/squad"

// A player in a table: their name, then club and position, then any warning tag.
// Each is on its own line and never wraps, however long the name is.
const PlayerCell = ({ player, flag, teamNames }) => (
    <div className="player-stack">
        <span>
            <span className="player-name" title={player.name}>{player.name}</span>
            {player.isCaptain && <abbr className="armband" title="Captain">C</abbr>}
            {player.isViceCaptain && <abbr className="armband" title="Vice-captain">V</abbr>}
        </span>
        <span className="muted player-meta">
            {[teamNames.get(player.team), POSITION_SHORT[player.position ?? player.elementType]].filter(Boolean).join(" · ")}
        </span>
        {/* Nothing is rendered for a fit player, so they get no empty third line */}
        <FlagBadge flag={flag} />
    </div>
)

export default PlayerCell
