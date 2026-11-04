// api.js
//
// The page makes three requests: predictions (Python), your team and the club names (Node).

export const NODE_URL = import.meta.env.VITE_NODE_URL || "http://localhost:8000"
export const PYTHON_URL = import.meta.env.VITE_PYTHON_URL || "http://127.0.0.1:8001"

export class ApiError extends Error {
    constructor(message, { service, status = null } = {}) {
        super(message)
        this.name = "ApiError"
        this.service = service
        this.status = status
    }
}

// A message the user can act on, from a failed response
export const describeFailure = ({ service, status, detail }) => {
    if (service === "predictions" && status === 503) {
        return "The model hasn't been trained yet. Run `npm run refresh` to sync the data and train it."
    }
    if (service === "predictions" && status === 502) {
        return "The prediction service can't reach the data service. Is the Node server running?"
    }
    if (service === "predictions" && status === 409) {
        return `${detail || "The model is out of step with the data"}`
    }
    if (service === "team" && status === 503) {
        return "No team is configured. Set MY_FPL_MANAGER_ID in server/.env and restart the server."
    }
    if (service === "team" && status === 404) {
        return "FPL has no manager with the configured MY_FPL_MANAGER_ID."
    }
    if (service === "team" && status === 502) {
        return "The server couldn't load your team from the FPL website."
    }

    return `The ${service} request failed (${status})${detail ? `: ${detail}` : ""}`
}

const unreachable = (service, baseUrl) => (
    `Can't reach the ${service} service at ${baseUrl}. Is it running?`
)

const getJson = async (baseUrl, path, service, { signal, fetchImpl = fetch } = {}) => {
    let response

    try {
        response = await fetchImpl(`${baseUrl}${path}`, { signal })
    } catch (error) {
        // A cancelled request is not a failure to report
        if (error?.name === "AbortError") {
            throw error
        }

        throw new ApiError(unreachable(service, baseUrl), { service })
    }

    if (!response.ok) {
        let detail = ""

        try {
            const body = await response.json()
            detail = body.detail || body.message || ""
        } catch {
            // No JSON body; the status says enough
        }

        throw new ApiError(describeFailure({ service, status: response.status, detail }), { service, status: response.status })
    }

    return response.json()
}

export const fetchPredictions = (options) => getJson(PYTHON_URL, "/predict?limit=1000", "predictions", options)
export const fetchMyTeam = (options) => getJson(NODE_URL, "/api/my-team", "team", options)
export const fetchTeams = (options) => getJson(NODE_URL, "/api/teams", "teams", options)

// Predictions are essential. Your team and the club names make the page better but it still works without them,
// so their failures are reported alongside rather than stopping everything.
export const loadAll = async (options = {}) => {
    const [ predictions, team, teams ] = await Promise.allSettled([
        fetchPredictions(options),
        fetchMyTeam(options),
        fetchTeams(options),
    ])

    if (predictions.status === "rejected") {
        throw predictions.reason
    }

    return {
        predictions: predictions.value,
        team: team.status === "fulfilled" ? team.value : null,
        teams: teams.status === "fulfilled" ? teams.value : [],
        problems: {
            team: team.status === "rejected" ? team.reason.message : null,
            teams: teams.status === "rejected" ? teams.reason.message : null,
        },
    }
}
