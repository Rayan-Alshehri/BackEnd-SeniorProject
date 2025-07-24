const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const dbName = process.env.DB_NAME;
const dbUri = process.env.DB_URI;

async function checkDatabaseExists() {
  const client = new MongoClient("mongodb://localhost:27017");
  try {
    await client.connect();
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    return collections.length > 0;
  } catch (err) {
    throw new Error(`Database check failed: ${  err.message}`);
  } finally {
    await client.close();
  }
}

const dbConnection = async () => {
  try {
    const dbIsValid = await checkDatabaseExists();
    if (!dbIsValid) {
      throw new Error(`Database "${dbName}" is empty or does NOT exist.`);
    }

    // Updated connection without deprecated options
    await mongoose.connect(dbUri); 
    
    console.log("Connected to existing MongoDB database with collections!");
  } catch (error) {
    console.error("DATABASE ERROR:", error.message);
    process.exit(1);
  }
};

module.exports = dbConnection;