require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URL = process.env.MONGO_URL;

async function clearDatabase() {
  try {
    if (!MONGO_URL) {
      throw new Error("MONGO_URL is missing in backend .env");
    }

    await mongoose.connect(MONGO_URL);
    await mongoose.connection.dropDatabase();

    console.log("Database cleared successfully");
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

clearDatabase();
