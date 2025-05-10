const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const { Conversation, Message } = require("../models/chatModel");
const { processAIResponse } = require("../utils/aiIntegration");
const User = require("../models/userModel");

// Configuration
const AI_RESPONSE_TIMEOUT_SECONDS = 60; // AI response timeout in seconds

// Schedule a job to run every 10 seconds to close inactive conversations
setInterval(async () => {
  try {
    const closedCount = await Conversation.closeInactiveConversations();
    if (closedCount > 0) {
      console.log(`Auto-closed ${closedCount} inactive conversations`);
    }
  } catch (error) {
    console.error('Error in auto-close job:', error);
  }
}, 10000);

// ==================== User Chat Functions ====================

// @desc    Start a new conversation
// @route   POST /api/v1/chats/conversations/start
// @access  Private
exports.startEmptyConversation = asyncHandler(async (req, res, next) => {
  const currentUserId = req.user._id.toString();
  
  // Create a new conversation
  const conversationId = await Conversation.create(currentUserId);
  
  // Mark as waiting for AI response
  await Conversation.setWaitingForAI(conversationId, true);
  
  try {
    // Request initial greeting from AI (introduction)
    console.log(`Starting initial AI greeting for conversation ${conversationId}`);
    const aiResponse = await processAIResponse(conversationId, "__START_CONVERSATION__");
    
    // Add AI response
    const aiMessageId = await Message.create(conversationId, 'ai', aiResponse);
    
    // Get the conversation and message
    const conversation = await Conversation.findById(conversationId);
    const aiMessage = await Message.findById(aiMessageId);
    
    // Mark conversation as no longer waiting
    await Conversation.setWaitingForAI(conversationId, false);
    
    res.status(201).json({ 
      data: {
        conversation,
        messages: [aiMessage]
      }
    });
  } catch (error) {
    console.error('AI processing error:', error);
    
    // Add error message
    const aiMessageId = await Message.create(
      conversationId, 
      'ai', 
      "I'm sorry, I encountered an error starting our conversation. Please try again."
    );
    
    // Get the conversation and message
    const conversation = await Conversation.findById(conversationId);
    const aiMessage = await Message.findById(aiMessageId);
    
    // Mark conversation as no longer waiting
    await Conversation.setWaitingForAI(conversationId, false);
    
    res.status(201).json({ 
      data: {
        conversation,
        messages: [aiMessage]
      },
      error: "AI processing error"
    });
  }
});

// @desc    Get all conversations for the current user
// @route   GET /api/v1/chats/conversations
// @access  Private
exports.getUserConversations = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id.toString();
  
  console.log(`Fetching all conversations for user: ${currentUserId}`);
  
  // Get all conversations for the user
  const conversations = await Conversation.findByUserId(currentUserId);
  
  console.log(`Found ${conversations.length} conversations`);
  
  res.status(200).json({ 
    results: conversations.length,
    data: conversations 
  });
});

// @desc    Get a specific conversation with messages
// @route   GET /api/v1/chats/conversations/:id
// @access  Private
exports.getConversation = asyncHandler(async (req, res, next) => {
  const conversationId = req.params.id;
  const currentUserId = req.user._id.toString();
  
  // Get the conversation
  const conversation = await Conversation.findById(conversationId);
  
  // Check if conversation exists
  if (!conversation) {
    return next(new ApiError(`Conversation with id ${conversationId} not found`, 404));
  }
  
  // Check if user has access to this conversation (either the owner or a teacher/admin)
  if (conversation.mongo_user_id !== currentUserId && 
      req.user.role !== 'teacher' && 
      req.user.role !== 'admin') {
    return next(new ApiError('You do not have access to this conversation', 403));
  }
  
  // If the user is a teacher or admin, fetch the student name
  let studentName = null;
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    const student = await User.findById(conversation.mongo_user_id, 'name');
    studentName = student ? student.name : 'Unknown Student';
  }
  
  // Get messages with pagination
  const limit = parseInt(req.query.limit, 10) || 50;
  const page = parseInt(req.query.page, 10) || 1;
  const offset = (page - 1) * limit;
  
  const messages = await Message.findByConversationId(conversationId, { limit, offset });
  const totalMessages = await Message.countByConversationId(conversationId);
  
  // Get waiting status
  const waitingStatus = await Conversation.getWaitingStatus(conversationId);
  
  res.status(200).json({
    data: {
      conversation: {
        ...conversation,
        student_name: studentName
      },
      messages,
      waiting_for_ai: waitingStatus.is_waiting_for_ai,
      waiting_seconds: waitingStatus.waiting_seconds,
      pagination: {
        total: totalMessages,
        page,
        limit,
        pages: Math.ceil(totalMessages / limit)
      }
    }
  });
});

// @desc    Get conversation status
// @route   GET /api/v1/chats/conversations/:id/status
// @access  Private
exports.getConversationStatus = asyncHandler(async (req, res, next) => {
  const conversationId = req.params.id;
  const currentUserId = req.user._id.toString();
  
  // Get the conversation
  const conversation = await Conversation.findById(conversationId);
  
  // Check if conversation exists
  if (!conversation) {
    return next(new ApiError(`Conversation with id ${conversationId} not found`, 404));
  }
  
  // Check if user has access to this conversation
  if (conversation.mongo_user_id !== currentUserId && 
      req.user.role !== 'teacher' && 
      req.user.role !== 'admin') {
    return next(new ApiError('You do not have access to this conversation', 403));
  }
  
  // Get last message
  const lastMessage = await Message.getLastMessage(conversationId);
  
  // Get waiting status
  const waitingStatus = await Conversation.getWaitingStatus(conversationId);
  
  res.status(200).json({
    data: {
      id: conversation.id,
      status: conversation.status,
      waiting_for_ai: waitingStatus.is_waiting_for_ai,
      waiting_seconds: waitingStatus.waiting_seconds,
      last_activity_at: conversation.last_activity_at,
      last_student_activity: conversation.last_student_activity,
      last_message: lastMessage ? {
        sender_type: lastMessage.sender_type,
        created_at: lastMessage.created_at
      } : null
    }
  });
});

// @desc    Send a message in a conversation
// @route   POST /api/v1/chats/conversations/:id/messages
// @access  Private
exports.sendMessage = asyncHandler(async (req, res, next) => {
  const conversationId = req.params.id;
  const currentUserId = req.user._id.toString();
  const { content } = req.body;
  
  if (!content) {
    return next(new ApiError("Message content is required", 400));
  }
  
  // Get the conversation
  const conversation = await Conversation.findById(conversationId);
  
  // Check if conversation exists
  if (!conversation) {
    return next(new ApiError(`Conversation with id ${conversationId} not found`, 404));
  }
  
  // Check if conversation is closed
  if (conversation.status === 'closed') {
    return next(new ApiError('This conversation has been closed', 400));
  }
  
  // Only the student who owns the conversation can send messages
  if (conversation.mongo_user_id !== currentUserId) {
    return next(new ApiError('You do not have access to this conversation', 403));
  }
  
  // Check if conversation is waiting for AI response
  const waitingStatus = await Conversation.getWaitingStatus(conversationId);
  
  if (waitingStatus.is_waiting_for_ai) {
    // If waiting more than the timeout, reset flag but return busy message
    if (waitingStatus.waiting_seconds > AI_RESPONSE_TIMEOUT_SECONDS) {
      // Auto-reset the waiting flag after timeout
      await Conversation.setWaitingForAI(conversationId, false);
      
      return res.status(202).json({
        status: 'busy',
        message: "The AI was busy processing your previous message. You can now send a new message."
      });
    // eslint-disable-next-line no-else-return
    } else {
      return res.status(409).json({
        status: 'waiting',
        message: "Please wait for the AI to respond to your previous message."
      });
    }
  }
  
  // Create the message
  const messageId = await Message.create(conversationId, 'user', content);
  
  // Update last student activity time
  await Conversation.updateLastActivity(conversationId);
  
  // Mark as waiting for AI response
  await Conversation.setWaitingForAI(conversationId, true);
  
  try {
    // Wait for AI response (this is synchronous now - we wait for the response)
    console.log(`Processing AI request for conversation ${conversationId}`);
    const aiResponse = await processAIResponse(conversationId, content);
    
    // Add AI response to the conversation
    const aiMessageId = await Message.create(conversationId, 'ai', aiResponse);
    
    // Get both the user message and AI response
    const userMessage = await Message.findById(messageId);
    const aiMessage = await Message.findById(aiMessageId);
    
    // Mark conversation as no longer waiting
    await Conversation.setWaitingForAI(conversationId, false);
    
    // Return both messages to the client
    res.status(201).json({ 
      data: {
        userMessage,
        aiMessage
      }
    });
  } catch (error) {
    console.error('AI processing error:', error);
    
    // Add error message
    const aiMessageId = await Message.create(
      conversationId, 
      'ai', 
      "I'm sorry, I encountered an error processing your request. Please try again."
    );
    
    const aiMessage = await Message.findById(aiMessageId);
    const userMessage = await Message.findById(messageId);
    
    // Mark conversation as no longer waiting
    await Conversation.setWaitingForAI(conversationId, false);
    
    // Still return both messages
    res.status(201).json({ 
      data: {
        userMessage,
        aiMessage
      },
      error: "AI processing error"
    });
  }
});

// ==================== Teacher Monitoring Functions ====================

// @desc    Get all student conversations (for teachers to view)
// @route   GET /api/v1/chats/student-conversations
// @access  Private/Teacher-Admin
exports.getAllStudentConversations = asyncHandler(async (req, res) => {
  // Get all student conversations from MySQL
  let conversations = await Conversation.getAllStudentConversations();
  
  // Extract unique user IDs from conversations
  const userIds = [...new Set(conversations.map(conv => conv.student_id))];
  
  // Fetch user names from MongoDB
  const users = await User.find({ _id: { $in: userIds } }, { _id: 1, name: 1 });
  
  // Create a map of user IDs to names
  const userMap = {};
  users.forEach(user => {
    userMap[user._id.toString()] = user.name;
  });
  
  // Add student names and remove duplicate ID field
  conversations = conversations.map(conv => {
    // Create a new object without mongo_user_id
    // eslint-disable-next-line camelcase, no-unused-vars
    const { mongo_user_id, ...convWithoutMongoId } = conv;
    
    // Return the new object with student_name added
    return {
      ...convWithoutMongoId,
      student_name: userMap[conv.student_id] || 'Unknown Student'
    };
  });
  
  res.status(200).json({ 
    results: conversations.length,
    data: conversations 
  });
});

// @desc    Close a conversation
// @route   PUT /api/v1/chats/conversations/:id/close
// @access  Private/Teacher-Admin
exports.closeConversation = asyncHandler(async (req, res, next) => {
  const conversationId = req.params.id;
  
  // Get the conversation
  const conversation = await Conversation.findById(conversationId);
  
  // Check if conversation exists
  if (!conversation) {
    return next(new ApiError(`Conversation with id ${conversationId} not found`, 404));
  }
  
  // Update the status to closed
  await Conversation.updateStatus(conversationId, 'closed');
  
  // Add a system message
  await Message.create(
    conversationId, 
    'ai', 
    'This conversation has been closed. Thank you for using our service.',
    { system_message: true }
  );
  
  res.status(200).json({ 
    status: 'success',
    message: 'Conversation closed successfully' 
  });
});

// @desc    Get chat statistics (for admin)
// @route   GET /api/v1/chats/stats
// @access  Private/Admin
exports.getChatStats = asyncHandler(async (req, res) => {
  // Get counts by status
  const statusCounts = await Conversation.getCounts();
  
  // Count total messages
  const [messageCountResult] = await global.mysqlPool.query(
    'SELECT COUNT(*) as count FROM messages'
  );
  const totalMessages = messageCountResult[0].count;
  
  // Count active users (users with at least one conversation)
  const [activeUsersResult] = await global.mysqlPool.query(
    'SELECT COUNT(DISTINCT mongo_user_id) as count FROM conversations'
  );
  const activeUsers = activeUsersResult[0].count;
  
  // Get recent activity
  const [recentActivity] = await global.mysqlPool.query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as message_count
     FROM messages
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY DATE(created_at)
     ORDER BY date DESC`
  );
  
  res.status(200).json({
    data: {
      statusCounts,
      totalMessages,
      activeUsers,
      recentActivity
    }
  });
});