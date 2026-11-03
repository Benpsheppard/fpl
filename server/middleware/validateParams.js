// validateParams.js

// For router.param: rejects anything that is not a whole number in range before a
// controller sees it. Ids go straight into FPL API URLs, so this also blocks path injection.
const integerParam = ({ min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => (req, res, next, value, name) => {
    if (!/^\d{1,15}$/.test(value) || Number(value) < min || Number(value) > max) {
        res.status(400).json({ message: `${name} must be an integer from ${min} to ${max}` })
        return
    }

    next()
}

// Ids and ranges shared by every router
const PARAM_RULES = {
    playerId: { max: 100000 },
    managerId: { max: 99999999 },
    gameweek: { max: 38 }
}

const validateCommonParams = (router) => {
    for (const [ name, rule ] of Object.entries(PARAM_RULES)) {
        router.param(name, integerParam(rule))
    }
}

module.exports = { integerParam, validateCommonParams }
