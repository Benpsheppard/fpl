const test = require("node:test")
const assert = require("node:assert/strict")

const { combineDoubleGameweeks } = require("../services/fplSyncService")

test("a single fixture gameweek is left unchanged", () => {
    const history = [{ round: 1, fixture: 11, total_points: 6, minutes: 90 }]

    assert.deepEqual(combineDoubleGameweeks(history), history)
})

test("a double gameweek is collapsed into one entry with summed totals", () => {
    const result = combineDoubleGameweeks([
        { round: 5, fixture: 1, total_points: 2, minutes: 90, influence: "10.0", value: 55 },
        { round: 5, fixture: 2, total_points: 7, minutes: 45, influence: "5.5", value: 56 }
    ])

    assert.equal(result.length, 1)
    assert.equal(result[0].total_points, 9)
    assert.equal(result[0].minutes, 135)
    assert.equal(result[0].influence, 15.5)
})

test("non-additive fields keep the first fixture's value", () => {
    const [entry] = combineDoubleGameweeks([
        { round: 5, fixture: 1, value: 55, was_home: true },
        { round: 5, fixture: 2, value: 56, was_home: false }
    ])

    assert.equal(entry.fixture, 1)
    assert.equal(entry.value, 55)
    assert.equal(entry.was_home, true)
})

test("other rounds are untouched and order is preserved", () => {
    const result = combineDoubleGameweeks([
        { round: 4, fixture: 9, total_points: 1 },
        { round: 5, fixture: 1, total_points: 2 },
        { round: 5, fixture: 2, total_points: 3 },
        { round: 6, fixture: 3, total_points: 4 }
    ])

    assert.deepEqual(result.map((entry) => [entry.round, entry.total_points]), [[4, 1], [5, 5], [6, 4]])
})

test("missing stat fields count as zero", () => {
    const [entry] = combineDoubleGameweeks([
        { round: 5, fixture: 1, minutes: 90 },
        { round: 5, fixture: 2 }
    ])

    assert.equal(entry.minutes, 90)
    assert.equal(entry.goals_scored, 0)
})
