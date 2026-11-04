import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DIFFICULTY_SCALE, describeFixture, difficultyLevel, fixtureCells } from "./fixtures"
import { contrast } from "../test/colour"
import { clubsMap, fixtureRun } from "../test/fixtures"

describe("difficultyLevel", () => {
    it.each([
        [1, "easiest"],
        [2, "easy"],
        [3, "neutral"],
        [4, "hard"],
        [5, "hardest"],
    ])("rates %s as %s", (difficulty, level) => {
        expect(difficultyLevel(difficulty)).toBe(level)
    })

    it("gives every rating its own level, so each can have its own colour", () => {
        const levels = [1, 2, 3, 4, 5].map(difficultyLevel)

        expect(new Set(levels).size).toBe(5)
    })

    it.each([[0], [-1], [6], [2.5], [null], [undefined], [NaN], ["3"]])("does not guess at %s", (difficulty) => {
        expect(difficultyLevel(difficulty)).toBe("unknown")
    })
})

describe("fixtureCells", () => {
    it("has one cell for every gameweek in the window", () => {
        const cells = fixtureCells(fixtureRun([[10, 1, true, 2]], { from: 10, to: 14 }))

        expect(cells.map((cell) => cell.gameweek)).toEqual([10, 11, 12, 13, 14])
    })

    it("leaves a blank gameweek as an empty cell", () => {
        const cells = fixtureCells(fixtureRun([[10, 1, true, 2], [12, 2, false, 4]]))

        expect(cells.map((cell) => cell.fixtures.length)).toEqual([1, 0, 1, 0, 0])
    })

    it("puts both fixtures of a double gameweek in the same cell, in order", () => {
        const cells = fixtureCells(fixtureRun([[11, 1, true, 2], [11, 3, false, 5]]))

        expect(cells[1].fixtures.map((fixture) => fixture.opponent)).toEqual([1, 3])
    })

    it("copes with a window that is one gameweek long", () => {
        expect(fixtureCells(fixtureRun([[38, 1, true, 3]], { from: 38, to: 38 }))).toHaveLength(1)
    })

    it.each([[null], [undefined], [{}], [{ from_gameweek: 10 }], [{ from_gameweek: "10", to_gameweek: 14 }]])("gives nothing for %j", (run) => {
        expect(fixtureCells(run)).toEqual([])
    })

    it("tolerates a run with no fixture list", () => {
        expect(fixtureCells({ from_gameweek: 10, to_gameweek: 11 }).map((cell) => cell.fixtures)).toEqual([[], []])
    })
})

describe("describeFixture", () => {
    // The shape /predict sends: snake_case
    const fixture = { gameweek: 12, opponent: 1, is_home: true, difficulty: 2, played: false }

    it("says it in words, so the colour isn't the only signal", () => {
        expect(describeFixture(fixture, clubsMap())).toBe("Gameweek 12: home to Arsenal, easy (2 out of 5)")
    })

    it("says away for an away fixture", () => {
        expect(describeFixture({ ...fixture, is_home: false }, clubsMap())).toBe("Gameweek 12: away at Arsenal, easy (2 out of 5)")
    })

    it.each([
        [1, "easiest"],
        [2, "easy"],
        [3, "neutral"],
        [4, "hard"],
        [5, "hardest"],
    ])("names rating %s as %s", (difficulty, word) => {
        expect(describeFixture({ ...fixture, difficulty }, clubsMap())).toContain(`${word} (${difficulty} out of 5)`)
    })

    it("falls back to the team number for an unknown club", () => {
        expect(describeFixture({ ...fixture, opponent: 99 }, clubsMap())).toContain("team 99")
    })

    it("leaves out the rating when there isn't one", () => {
        expect(describeFixture({ ...fixture, difficulty: null }, clubsMap())).not.toContain("out of 5")
    })

    it("says when it has been played", () => {
        expect(describeFixture({ ...fixture, played: true }, clubsMap())).toContain("already played")
    })
})

// jsdom doesn't apply stylesheets, so these read the CSS text to check the colours themselves
describe("fixture colours in the stylesheet", () => {
    // (A string path: jsdom's own URL class isn't accepted by fs, and Vitest turns imported CSS into an empty string)
    const css = readFileSync(join(import.meta.dirname, "..", "index.css"), "utf8")
    const section = css.slice(css.indexOf("/* Fixture difficulty"), css.indexOf(".fixture-run {"))
    const themes = { light: section.slice(0, section.indexOf("@media")), dark: section.slice(section.indexOf("@media")) }

    const colours = (text) => {
        const found = {}
        for (const [, name, background, value] of text.matchAll(/--([a-z]+)(-bg)?:\s*(#[0-9a-fA-F]{6});/g).map((m) => [m[0], m[1], m[2], m[3]])) {
            found[`${name}${background ?? ""}`] = value
        }
        return found
    }

    it.each(DIFFICULTY_SCALE.map(({ level }) => [level]))("has a style rule for the %s class", (level) => {
        expect(css).toMatch(new RegExp(`\\.fixture-${level}\\s*\\{[^}]*background:\\s*var\\(--${level}-bg\\)[^}]*color:\\s*var\\(--${level}\\)`))
    })

    it.each(Object.keys(themes).flatMap((theme) => DIFFICULTY_SCALE.map(({ level }) => [theme, level])))(
        "defines a colour for %s mode, level %s, that is readable",
        (theme, level) => {
            const palette = colours(themes[theme])

            expect(palette[`${level}-bg`], `${level} background`).toBeDefined()
            expect(palette[level], `${level} text`).toBeDefined()
            expect(contrast(palette[level], palette[`${level}-bg`])).toBeGreaterThanOrEqual(4.5)
        },
    )

    it.each(Object.keys(themes))("gives every level a different background in %s mode", (theme) => {
        const palette = colours(themes[theme])
        const backgrounds = DIFFICULTY_SCALE.map(({ level }) => palette[`${level}-bg`])

        expect(new Set(backgrounds).size).toBe(5)
    })

    it.each(Object.keys(themes))("keeps the deep colours clearly apart from the pale ones in %s mode", (theme) => {
        const palette = colours(themes[theme])

        expect(contrast(palette["easiest-bg"], palette["easy-bg"])).toBeGreaterThan(2)
        expect(contrast(palette["hardest-bg"], palette["hard-bg"])).toBeGreaterThan(2)
    })
})
