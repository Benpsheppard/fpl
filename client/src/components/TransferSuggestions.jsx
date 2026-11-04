import { BACKTEST } from "../lib/reliability"
import { MIN_NET_GAIN } from "../lib/transfers"
import TransferOption from "./TransferOption"

const TransferSuggestions = ({ swaps, teamNames, clubs, freeTransfers, limit = 8 }) => (
    <section className="panel" aria-labelledby="swaps-title">
        <header className="panel-header">
            <h2 id="swaps-title">Best transfers</h2>
            <p className="muted">
                One transfer at a time, for next gameweek only.
                {freeTransfers === 0 && " With no free transfer, each costs a 4-point hit."}
            </p>
            <p className="muted">
                "Right N% of the time" is how often a gap that size came off in past gameweeks ({BACKTEST.gameweeks}):
                the higher-rated player really scored more. Under 60% is close to a coin flip.
            </p>
        </header>

        {swaps.length === 0
            ? (
                <p className="empty">
                    No swap is worth making: none beats your current player by at least {MIN_NET_GAIN} points, which is
                    about the size of the model's error.
                </p>
            )
            : (
                <ol className="swap-list">
                    {swaps.slice(0, limit).map((swap) => (
                        <TransferOption
                            key={`${swap.out.playerId}-${swap.in.playerId}`}
                            swap={swap}
                            teamNames={teamNames}
                            clubs={clubs}
                        />
                    ))}
                </ol>
            )}
    </section>
)

export default TransferSuggestions
