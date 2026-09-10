// db.js

// Import
const mongoose = require('mongoose')

// Function to connect to database
const connectDB = async () => { 
    try {
        if (process.env.NODE_ENV === 'development') {
            const conn = await mongoose.connect(process.env.MONGO_URI_TEST)
            console.log(`MongoDB Connected (development): ${conn.connection.host}`)
        } else {
            const conn = await mongoose.connect(process.env.MONGO_URI)
            console.log(`MongoDB Connected: ${conn.connection.host}`)
        }
    } catch (error) {
        console.log(error)
        process.exit(1)
    }
}

module.exports = connectDB