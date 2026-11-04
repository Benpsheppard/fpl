import { points, pounds, signed } from "../lib/format"
import FixtureRun from "./FixtureRun"
import FlagBadge from "./FlagBadge"
import { getFlag } from "../lib/flags"
import { reliabilityForGap } from "../lib/reliability"

const TransferOption = ({ swap, teamNames, clubs }) => {
    // How often a swap this size has come off in past gameweeks, judged on the model's gap between the two players
    const reliability = reliabilityForGap(swap.gain)
    const classes = ["swap", swap.priority && "swap-priority", reliability && `swap-${reliability.level}`].filter(Boolean).join(" ")

    return (
        <li className={classes}>
            <div className="swap-players">
                <div className="swap-side">
                    <span className="swap-label">Sell</span> <strong>{swap.out.name}</strong>
                    {swap.benchUpgrade && <span className="bench" title="Bench player: the gain is what the new player adds by taking a starting place">Bench</span>}
                    <span className="muted"> {pounds(swap.out.sellPrice)} · {points(swap.out.expected_points)} pts</span>
                    <FlagBadge flag={swap.out.flag} />
                    <FixtureRun run={swap.out.upcoming_fixtures} clubs={clubs} />
                </div>
                <div className="swap-side">
                    <span className="swap-label">Buy</span> <strong>{swap.in.name}</strong>
                    <span className="muted"> {teamNames.get(swap.in.team) ?? ""} · {pounds(swap.in.price)} · {points(swap.in.expected_points)} pts</span>
                    <FlagBadge flag={getFlag(swap.in)} />
                    <FixtureRun run={swap.in.upcoming_fixtures} clubs={clubs} />
                </div>
            </div>

            <div className="swap-numbers">
                <strong className="gain">{signed(swap.netGain)} pts</strong>
                {swap.hitCost > 0 && <span className="muted">after a {swap.hitCost}-point hit</span>}
                <span className="muted">bank {pounds(swap.bankAfter)}</span>
                {reliability && (
                    <span className={`reliability reliability-${reliability.level}`} title={reliability.detail}>
                        {reliability.label}
                    </span>
                )}
            </div>
        </li>
    )
}

export default TransferOption