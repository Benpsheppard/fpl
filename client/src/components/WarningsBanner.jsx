// Shown only when the predictions service reports the data or the model is out of date
const WarningsBanner = ({ warnings = [], dataThrough, modelThrough }) => {
    if (warnings.length === 0) {
        return null
    }

    return (
        <section className="banner" role="alert" aria-label="Predictions may be out of date">
            <strong>These predictions may be out of date.</strong>
            <ul>
                {warnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                ))}
            </ul>
            <p className="banner-detail">
                Player data runs to gameweek {dataThrough ?? "?"}; the model was trained through gameweek {modelThrough ?? "?"}.
                Run <code>npm run refresh</code> to update both.
            </p>
        </section>
    )
}

export default WarningsBanner
