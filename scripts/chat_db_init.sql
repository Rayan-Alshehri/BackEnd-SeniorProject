-- 1. Conversations Table
CREATE TABLE
  IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mongo_user_id VARCHAR(24) NOT NULL COMMENT 'MongoDB user reference',
    status ENUM ('open', 'closed') DEFAULT 'open',
    title VARCHAR(255) COMMENT 'Auto-generated first message snippet',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_student_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Last time the student was active',
    is_waiting_for_ai BOOLEAN DEFAULT FALSE COMMENT 'Flag indicating if waiting for AI response',
    ai_request_started_at TIMESTAMP NULL COMMENT 'When the AI request was started',
    INDEX idx_conversations_user (mongo_user_id),
    INDEX idx_conversations_status (status),
    INDEX idx_student_activity (last_student_activity)
  );

-- 2. Messages Table
CREATE TABLE
  IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_type ENUM ('user', 'ai') NOT NULL,
    content TEXT NOT NULL COMMENT 'Text of message',
    metadata JSON DEFAULT NULL COMMENT 'Timestamps, AI model version, confidence scores',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    INDEX idx_messages_conversation (conversation_id),
    INDEX idx_messages_created (created_at)
  );