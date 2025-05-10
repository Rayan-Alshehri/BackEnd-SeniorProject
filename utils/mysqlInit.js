/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
// Simplified mysqlInit.js (since indexes are now in the SQL)
const fs = require('fs');
const path = require('path');

// Function to initialize MySQL tables
const initializeMySQLTables = async () => {
  try {
    // Read the SQL file for table creation
    const sqlFilePath = path.join(__dirname, '../scripts/chat_db_init.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split the SQL script into individual statements
    const statements = sqlScript
      .split(';')
      .filter(statement => statement.trim() !== '');
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim().length > 0) {
        await global.mysqlPool.query(`${statement  };`);
      }
    }
    
    console.log('MySQL tables initialized successfully');
  } catch (error) {
    console.error('Error initializing MySQL tables:', error);
    throw error;
  }
};

module.exports = { initializeMySQLTables };