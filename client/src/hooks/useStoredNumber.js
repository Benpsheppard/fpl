import { useCallback, useState } from "react"

// A number remembered between visits. Browser storage can be missing or blocked
// (private windows, strict settings), so the page must work without it.
const read = (key, fallback, min, max) => {
    try {
        const stored = Number(window.localStorage.getItem(key))

        if (window.localStorage.getItem(key) !== null && Number.isInteger(stored) && stored >= min && stored <= max) {
            return stored
        }
    } catch {
        // Storage unavailable: use the default
    }

    return fallback
}

export const useStoredNumber = (key, fallback, { min, max }) => {
    const [value, setValue] = useState(() => read(key, fallback, min, max))

    const update = useCallback((next) => {
        const clamped = Math.min(max, Math.max(min, next))

        setValue(clamped)

        try {
            window.localStorage.setItem(key, String(clamped))
        } catch {
            // Not remembered, but still works for this visit
        }
    }, [key, min, max])

    return [value, update]
}
