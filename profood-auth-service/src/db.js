const dns = require("dns");
const mongoose = require("mongoose");

// Force Node.js to use public DNS servers.
// This fixes querySrv ECONNREFUSED with MongoDB Atlas.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI is missing in .env file");
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = connectDB;