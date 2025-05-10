const mysql = require('mysql2/promise');

// Database configuration
const dbName = process.env.MYSQL_DATABASE;
const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Shared pool that will be initialized once and reused
let pool;

// Check if database exists
async function checkDatabaseExists() {
  // Create a connection without specifying database to check if it exists
  const tempPool = mysql.createPool({
    ...dbConfig,
    database: null
  });
  
  try {
    const [rows] = await tempPool.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, 
      [dbName]
    );
    
    await tempPool.end();
    return rows.length > 0;
  } catch (err) {
    await tempPool.end();
    throw new Error(`Database check failed: ${err.message}`);
  }
}

// Database connection function
const mysqlConnection = async () => {
  try {
    // Check if database exists
    const dbExists = await checkDatabaseExists();
    if (!dbExists) {
      throw new Error(`Database "${dbName}" does not exist.`);
    }
    
    // Create the connection pool
    pool = mysql.createPool(dbConfig);
    
    // Test the connection
    const connection = await pool.getConnection();
    console.log(`Connected to MySQL database: ${dbName}`);
    connection.release();
    
    // Make pool available globally
    global.mysqlPool = pool;
    
    return pool;
  } catch (error) {
    console.error('MySQL DATABASE ERROR:', error.message);
    process.exit(1);
  }
};

module.exports = mysqlConnection;