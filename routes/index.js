// routes/index.js
const userRoute = require("./userRoute");
const authRoute = require("./authRoute");
const chatRoute = require("./chatRoutes");

const mountRoutes = (app) => {
  app.use("/api/v1/users", userRoute);
  app.use("/api/v1/auth", authRoute);
  app.use("/api/v1/chats", chatRoute);
};

module.exports = mountRoutes;