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
