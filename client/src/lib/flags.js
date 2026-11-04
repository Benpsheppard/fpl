// flags.js
//
// One availability flag per player, from FPL's injury news and the model's own
// stage-1 estimate of whether they play at all.

// The model's chance of a fit player appearing, below which they are a rotation risk
export const ROTATION_THRESHOLD = 0.6

// Not available whatever the percentage says: injured, suspended, unavailable, not in squad
const UNAVAILABLE_STATUSES = ["i", "s", "u", "n"]

export const FLAG_LEVELS = ["out", "doubtful", "rotation", "blank", "ok"]

const percent = (fraction) => `${Math.round(fraction * 100)}%`

// player is a /predict row, optionally carrying FPL's `status` and `news` for owned players
export const getFlag = (player) => {
    if (!player || player.expected_points === undefined) {
        return { level: "blank", label: "No fixture", detail: "No upcoming fixture to predict" }
    }

    const availability = player.adjustments?.availability ?? {}
    const status = availability.status ?? player.status ?? null
    const chance = availability.chance ?? null
    const news = player.news || ""

    if (chance === 0 || (chance === null && UNAVAILABLE_STATUSES.includes(status))) {
        return { level: "out", label: "Out", detail: news || "Not expected to play" }
    }

    if (status === "d" || (chance !== null && chance < 1)) {
        const detail = news || (chance !== null ? `${percent(chance)} chance of playing` : "Doubtful")
        return { level: "doubtful", label: chance !== null ? `Doubtful ${percent(chance)}` : "Doubtful", detail }
    }

    // Fit, but the model expects them to be left out. This is what stage 1 adds beyond the injury news.
    if (player.appearance_probability !== undefined && player.appearance_probability < ROTATION_THRESHOLD) {
        return {
            level: "rotation",
            label: "Rotation risk",
            detail: `Model gives ${percent(player.appearance_probability)} chance of playing`,
        }
    }

    return { level: "ok", label: "Fit", detail: news }
}
