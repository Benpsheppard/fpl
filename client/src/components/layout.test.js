import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// jsdom doesn't apply stylesheets, so rules that stop a name wrapping can only be checked in the CSS text.
// (A string path: jsdom's own URL class isn't accepted by fs.)
const css = readFileSync(join(import.meta.dirname, "..", "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

// The declarations of the rule with exactly this selector (not one that merely ends with it)
const rule = (selector) => {
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (selectors.split(",").some((candidate) => candidate.trim() === selector)) {
            return body
        }
    }

    return ""
}

describe("a player's name never wraps", () => {
    it("keeps the name and club line on one line", () => {
        expect(rule(".player-stack > span")).toMatch(/white-space:\s*nowrap/)
    })

    it("keeps the warning tag on one line", () => {
        expect(rule(".flag")).toMatch(/white-space:\s*nowrap/)
    })

    it("stacks the lines with the tag flush left rather than indented", () => {
        expect(rule(".player-stack")).toMatch(/flex-direction:\s*column/)
        expect(rule(".player-stack .flag")).toMatch(/margin-left:\s*0/)
    })
})

describe("squad tables line up", () => {
    const widthOf = (selector) => Number((rule(selector).match(/width:\s*(\d+)px/) ?? [])[1])
    const FIXED_COLUMNS = [".squad-table .col-player", ".squad-table .col-points", ".squad-table .col-playing", ".squad-table .col-sell", ".squad-table .col-fixtures"]

    it("uses a fixed layout, so a section's own contents can't change its column widths", () => {
        expect(rule(".squad-table")).toMatch(/table-layout:\s*fixed/)
    })

    it.each(FIXED_COLUMNS)("gives %s a width in pixels", (selector) => {
        expect(widthOf(selector)).toBeGreaterThan(0)
    })

    it("is wide enough for its fixed columns plus room for the suggested swap, so it scrolls rather than squashing", () => {
        const minimum = Number((rule(".squad-table").match(/min-width:\s*(\d+)px/) ?? [])[1])
        const fixed = FIXED_COLUMNS.reduce((sum, selector) => sum + widthOf(selector), 0)

        expect(minimum).toBeGreaterThanOrEqual(fixed + 150)
    })

    it("lets the fixtures column hold five chips", () => {
        // A chip is at least 4.3rem (about 69px) with 4px gaps, plus the cell's padding
        expect(widthOf(".squad-table .col-fixtures")).toBeGreaterThanOrEqual(5 * 69 + 4 * 4 + 16)
    })

    it("cuts a name too long for its column with an ellipsis instead of overlapping the next one", () => {
        expect(rule(".player-stack > span")).toMatch(/overflow:\s*hidden/)
        expect(rule(".player-stack > span")).toMatch(/text-overflow:\s*ellipsis/)
    })
})
