// server.js

// Imports
require('dotenv').config()
const connectDB = require('./config/db.js')
const { createApp } = require('./app')

// Variables
const port = process.env.PORT || 8000
// Local only unless HOST says otherwise
const host = process.env.HOST || '127.0.0.1'

const start = async () => {
    await connectDB()

    createApp().listen(port, host, () => {
        console.log(`Server running on http://${host}:${port}`)
    })
}

start()
