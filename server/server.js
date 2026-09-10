// server.js

// Imports
require('dotenv').config()
const express = require('express')

// Routers
const { fplRouter } = require("./routes/fplRoutes")     

// Variables
const port = process.env.PORT || 5050

// App
const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded())

// Routes
app.use("/api/fpl", fplRouter)

// Port listener
app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})