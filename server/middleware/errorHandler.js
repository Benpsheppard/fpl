// errorHandler.js

const notFound = (req, res) => {
    res.status(404).json({ message: "Route not found" })
}

// Controllers sometimes set a 4xx status before throwing; keep it. Anything else is a 500
// whose details stay in the server log rather than the response.
const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error)
        return
    }

    const status = error.statusCode || error.status || (res.statusCode >= 400 ? res.statusCode : 500)

    if (status >= 500) {
        console.error(error)
    }

    res.status(status).json({
        message: status >= 500 ? "Internal server error" : error.message
    })
}

module.exports = { notFound, errorHandler }
