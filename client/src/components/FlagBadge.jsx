// A player's availability at a glance; the detail (injury news) is in the tooltip
const FlagBadge = ({ flag }) => {
    if (flag.level === "ok") {
        return null
    }

    return (
        <span className={`flag flag-${flag.level}`} title={flag.detail}>
            {flag.label}
        </span>
    )
}

export default FlagBadge
