// syncLock.js
//
// Bulk syncs each make hundreds of calls to the FPL API and write the same
// collections, so only one runs at a time per server process.

let running = null

class SyncInProgressError extends Error {
    constructor(runningName) {
        super(`Sync already in progress: ${runningName}`)
        this.name = "SyncInProgressError"
        this.statusCode = 409
    }
}

const withSyncLock = async (name, task) => {
    if (running) {
        throw new SyncInProgressError(running)
    }

    running = name

    try {
        return await task()
    } finally {
        running = null
    }
}

module.exports = { withSyncLock, SyncInProgressError }
