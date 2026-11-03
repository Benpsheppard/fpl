// datasetCache.js
//
// Building the training dataset reads most of the database and takes a while,
// but its inputs only change when a sync runs. Cache the result and drop it
// whenever a sync writes data. Concurrent requests share one build.

let cached = null
let building = null
let generation = 0

const getCachedDataset = async (build) => {
    if (cached) {
        return cached
    }

    if (!building) {
        const startedAt = generation

        building = build()
            .then((dataset) => {
                // A sync landed while building: serve this result but don't keep it
                if (startedAt === generation) {
                    cached = dataset
                }

                return dataset
            })
            .finally(() => {
                building = null
            })
    }

    return building
}

const invalidateDatasetCache = () => {
    generation++
    cached = null
}

module.exports = { getCachedDataset, invalidateDatasetCache }
