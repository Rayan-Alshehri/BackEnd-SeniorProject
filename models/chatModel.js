// Conversation model for interacting with the conversations table
exports.Conversation = {
  // Create a new conversation for a user
  create: async (mongoUserId, title = null) => {
    const [result] = await global.mysqlPool.query(
      'INSERT INTO conversations (mongo_user_id, title, last_student_activity) VALUES (?, ?, NOW())',
      [mongoUserId, title]
    );
    return result.insertId;
  },
  
  // Get a conversation by ID
  findById: async (id) => {
    const [rows] = await global.mysqlPool.query(
      'SELECT * FROM conversations WHERE id = ?', 
      [id]
    );
    return rows[0];
  },
  
  // Get all conversations for a user
  findByUserId: async (mongoUserId) => {
    const [rows] = await global.mysqlPool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) as last_message_at
       FROM conversations c 
       WHERE c.mongo_user_id = ?
       ORDER BY c.last_activity_at DESC`,
      [mongoUserId]
    );
    return rows;
  },
  
  // Get all student conversations for teachers to view
  getAllStudentConversations: async () => {
    const [rows] = await global.mysqlPool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) as last_message_at,
        c.mongo_user_id as student_id
       FROM conversations c 
       ORDER BY c.last_activity_at DESC`
    );
    return rows;
  },
  
  // Update conversation status (open, closed)
  updateStatus: async (conversationId, status) => {
    const [result] = await global.mysqlPool.query(
      'UPDATE conversations SET status = ? WHERE id = ?',
      [status, conversationId]
    );
    return result.affectedRows > 0;
  },
  
  // Check and close inactive conversations (30 minutes timeout)
  closeInactiveConversations: async () => {
    try {
      const [result] = await global.mysqlPool.query(
        `UPDATE conversations 
        SET status = 'closed' 
        WHERE status = 'open' 
        AND last_student_activity < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        AND is_waiting_for_ai = 0`  // Only close if not waiting for AI
      );
      return result.affectedRows;
    } catch (error) {
      console.error('Error closing inactive conversations:', error);
      return 0;
    }
  },
  
  // Update last student activity timestamp
  updateLastActivity: async (conversationId) => {
    const [result] = await global.mysqlPool.query(
      'UPDATE conversations SET last_student_activity = NOW(), last_activity_at = NOW() WHERE id = ?',
      [conversationId]
    );
    return result.affectedRows > 0;
  },
  
  // Get conversation waiting status (if AI is still processing)
  getWaitingStatus: async (conversationId) => {
    const [rows] = await global.mysqlPool.query(
      `SELECT 
         is_waiting_for_ai,
         TIMESTAMPDIFF(SECOND, ai_request_started_at, NOW()) as waiting_seconds
       FROM conversations
       WHERE id = ?`,
      [conversationId]
    );
    return rows[0];
  },
  
  // Set conversation to waiting for AI response
  setWaitingForAI: async (conversationId, isWaiting) => {
    const [result] = await global.mysqlPool.query(
      `UPDATE conversations 
       SET is_waiting_for_ai = ?, 
           ai_request_started_at = ${isWaiting ? 'NOW()' : 'NULL'}
       WHERE id = ?`,
      [isWaiting, conversationId]
    );
    return result.affectedRows > 0;
  },
  
  // Get total counts of conversations by status
  getCounts: async () => {
    const [rows] = await global.mysqlPool.query(
      `SELECT 
        status, 
        COUNT(*) as count 
       FROM conversations 
       GROUP BY status`
    );
    
    // Convert to an object with status as keys
    const counts = { open: 0, closed: 0 };
    rows.forEach(row => {
      counts[row.status] = row.count;
    });
    
    return counts;
  }
};

// Message model for interacting with the messages table
exports.Message = {
  // Create a new message
  create: async (conversationId, senderType, content, metadata = null) => {
    // Convert metadata to JSON string if provided
    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    
    // Update conversation's last_activity_at timestamp
    await global.mysqlPool.query(
      'UPDATE conversations SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?',
      [conversationId]
    );
    
    // If this is the first message and from a user, use it to set the conversation title
    if (senderType === 'user') {
      const [countResult] = await global.mysqlPool.query(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
        [conversationId]
      );
      
      if (countResult[0].count === 0) {
        // This is the first message, set it as the conversation title (truncated if needed)
        const title = content.length > 50 ? `${content.substring(0, 47)  }...` : content;
        await global.mysqlPool.query(
          'UPDATE conversations SET title = ? WHERE id = ?',
          [title, conversationId]
        );
      }
    }
    
    // Insert the message
    const [result] = await global.mysqlPool.query(
      'INSERT INTO messages (conversation_id, sender_type, content, metadata) VALUES (?, ?, ?, ?)',
      [conversationId, senderType, content, metadataStr]
    );
    
    return result.insertId;
  },
  
  // Get a message by ID
  findById: async (id) => {
    const [rows] = await global.mysqlPool.query(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    );
    return rows[0];
  },
  
  // Get all messages for a conversation with pagination
  findByConversationId: async (conversationId, { limit = 50, offset = 0 } = {}) => {
    const [rows] = await global.mysqlPool.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [conversationId, limit, offset]
    );
    
    // Parse metadata JSON for each message
    return rows.map(message => {
      if (message.metadata) {
        try {
          message.metadata = JSON.parse(message.metadata);
        } catch (e) {
          // If parsing fails, keep as is
        }
      }
      return message;
    });
  },
  
  // Count the total number of messages in a conversation
  countByConversationId: async (conversationId) => {
    const [result] = await global.mysqlPool.query(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
      [conversationId]
    );
    return result[0].count;
  },
  
  // Get last message in a conversation
  getLastMessage: async (conversationId) => {
    const [rows] = await global.mysqlPool.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1',
      [conversationId]
    );
    return rows[0];
  }
};