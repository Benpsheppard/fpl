import { useCallback, useEffect, useState } from "react"
import { loadAll } from "../lib/api"

// Loads everything the page needs, and again on demand
export const useDashboard = (horizon = 1) => {
    const [state, setState] = useState({ status: "loading", error: null, data: null })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()

        loadAll({ signal: controller.signal, horizon })
            .then((data) => setState({ status: "ready", error: null, data }))
            .catch((error) => {
                // Navigating away cancels the request; that isn't an error to show
                if (error?.name !== "AbortError") {
                    setState({ status: "error", error: error.message, data: null })
                }
            })

        return () => controller.abort()
    }, [attempt, horizon])

    const reload = useCallback(() => {
        setState((current) => ({ ...current, status: "loading", error: null }))
        setAttempt((n) => n + 1)
    }, [])

    return { ...state, reload }
}
