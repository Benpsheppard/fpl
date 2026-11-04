// format.js

export const pounds = (millions) => (millions === null || millions === undefined ? "–" : `£${millions.toFixed(1)}m`)

export const points = (value) => (value === null || value === undefined ? "–" : value.toFixed(1))

export const percent = (fraction) => (fraction === null || fraction === undefined ? "–" : `${Math.round(fraction * 100)}%`)

// +1.2 / -0.4, for gains and losses
export const signed = (value) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`
