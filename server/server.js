// server.js

// Imports
require('dotenv').config()
const express = require('express')
const connectDB = require('./config/db.js')                       

// Routers
const { fplRouter } = require("./routes/fplRoutes")     
const { playerRouter } = require('./routes/playerRoutes.js')
const { predictionFeatureRouter } = require('./routes/predictionFeatureRoutes.js')

// Variables
const port = process.env.PORT || 5050

// Connect to database
connectDB()

// App
const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded())

// Routes
app.use("/api/fpl", fplRouter)
app.use("/api/players", playerRouter)
app.use("/api/prediction", predictionFeatureRouter)

// Port listener
app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})