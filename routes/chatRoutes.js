const express = require("express");
const {
  getUserConversations,
  getConversation,
  getConversationStatus,
  sendMessage,
  getAllStudentConversations,
  closeConversation,
  getChatStats,
  startEmptyConversation
} = require("../services/chatService");

const authService = require("../services/authService");

const router = express.Router();

// Protect all chat routes - require login
router.use(authService.protect);


// Add this new route to chatRoutes.js
router.route("/conversations/start")
  .post(startEmptyConversation);

// User chat routes
router.route("/conversations")
  .get(getUserConversations);

router.route("/conversations/:id")
  .get(getConversation);

router.route("/conversations/:id/messages")
  .post(sendMessage);

// Teacher routes (only accessible to teachers and admins)
router.route("/conversations/:id/status")
  .get(getConversationStatus);

router.route("/student-conversations")
  .get(
    authService.allowedTo("teacher", "admin"),
    getAllStudentConversations
  );

router.route("/conversations/:id/close")
  .put(
    authService.allowedTo("teacher", "admin"),
    closeConversation
  );

// Admin routes
router.route("/stats")
  .get(
    authService.allowedTo("admin"),
    getChatStats
  );

module.exports = router;