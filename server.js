const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require('cors');

dotenv.config({ path: "config.env" });
const ApiError = require("./utils/apiError");
const globalError = require("./middlewares/errorMiddleware");
const dbConnection = require("./config/database");
const mysqlConnection = require("./config/mysqlDatabase");
const { initializeMySQLTables } = require("./utils/mysqlInit")
const { setupAIBridge } = require('./utils/aiIntegration');

// Routes
const mountRoutes = require("./routes");


//connect with databases 
dbConnection();

// Connect with MySQL database and initialize tables
(async () => {
  await mysqlConnection(); // First establish the connection
  await initializeMySQLTables(); // Then create tables if they don't exist
})();


// Setup AI integration
setupAIBridge();


//express app
const app = express();

// Add CORS middleware here
app.use(cors({
  origin: 'http://localhost:5173', // No trailing slash!
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

//Middlewares
app.use(express.json({ limit: "20kb" }));


const NODE_ENV = "development";
if (NODE_ENV === "development") {
  app.use(morgan("dev"));
  console.log(`mode: ${process.env.NODE_ENV}`);
}

// Mount Routes
mountRoutes(app);

app.all("*", (req, res, next) => {
  next(new ApiError(`Can't find this route: ${req.originalUrl}`, 400));
});

// Global error handling middleware
app.use(globalError);

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  console.log(`App running on port ${PORT}`);
});

// Handle rejection outside express
process.on("unhandledRejection", (err) => {
  console.error(`UnhandledRejection Errors: ${err.name} | ${err.message}`);
  server.close(() => {
    console.error(`shutting down....`);
    process.exit(1);
  });
});
