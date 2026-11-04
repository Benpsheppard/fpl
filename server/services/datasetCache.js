// datasetCache.js
//
// Building the training dataset reads most of the database and takes a while,
// but its inputs only change when a sync runs. Cache the result and drop it
// whenever a sync writes data. Concurrent requests for the same dataset share
// one build. Datasets are kept by key, because the dataset for looking one
// gameweek ahead differs from the one for looking three ahead.

const DEFAULT_KEY = "default"

const cached = new Map()
const building = new Map()
let generation = 0

const getCachedDataset = async (build, key = DEFAULT_KEY) => {
    if (cached.has(key)) {
        return cached.get(key)
    }

    if (!building.has(key)) {
        const startedAt = generation

        const pending = build()
            .then((dataset) => {
                // A sync landed while building: serve this result but don't keep it
                if (startedAt === generation) {
                    cached.set(key, dataset)
                }

                return dataset
            })
            .finally(() => {
                building.delete(key)
            })

        building.set(key, pending)
    }

    return building.get(key)
}

const invalidateDatasetCache = () => {
    generation++
    cached.clear()
}

module.exports = { getCachedDataset, invalidateDatasetCache }
