/**
 * AI Integration Utility
 * 
 * This module handles the integration with the AI chatbot implemented in Python.
 * It processes user messages and returns AI responses.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Message } = require('../models/chatModel');

// Function to process user message with AI and get a response
exports.processAIResponse = async (conversationId, userMessage) => {
  try {
    // Special case for starting conversation
    const isStartingConversation = userMessage === "__START_CONVERSATION__";
    
    // Get conversation history for context
    const messages = await Message.findByConversationId(conversationId, { limit: 10 });
    const context = messages.map(msg => ({
      role: msg.sender_type === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    // Set a timeout for AI processing 
    const AI_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    // Connect to the Python AI implementation
    // eslint-disable-next-line no-unused-vars
    return new Promise((resolve, reject) => {
      // Path to your Python script - use the environment variable or default
      const pythonPath = process.env.PYTHON_PATH || 'python';
      const scriptPath = path.join(__dirname, '../ai/process_message.py');
      
      // Check if the script exists
      if (!fs.existsSync(scriptPath)) {
        console.warn(`Python script not found at ${scriptPath}, using simulated AI response`);
        // Simulate AI processing time (1-3 seconds)
        setTimeout(() => {
          // Simulate AI response - special case for starting conversation
          if (isStartingConversation) {
            resolve("Hello! I'm your AI assistant. What's your name?");
          } else {
            const responses = [
              "I understand what you're asking about. Let me help you with that.",
              "That's an interesting question. Based on my knowledge, I would say...",
              "I'd be happy to help with that. Here's what I know:",
              "Thank you for your question. Let me provide some information on that topic."
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            resolve(`${randomResponse} [Regarding: "${userMessage}"]`);
          }
        }, Math.random() * 2000 + 1000);
        return;
      }
      
      // Define the process variable in the proper scope
      let pythonProcess;
      let isResolved = false;
      let timeoutId;
      
      try {
        // Create a timeout to kill the process if it takes too long
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.error(`AI processing timeout after ${AI_TIMEOUT_MS}ms`);
            if (pythonProcess) {
              pythonProcess.kill();
            }
            isResolved = true;
            
            // Special message for start conversation timeout
            if (isStartingConversation) {
              resolve("Hello! I'm your AI assistant, but I'm having trouble starting our conversation. What's your name?");
            } else {
              resolve(`I received your message about "${userMessage}", but I'm taking longer than expected to process it. Please try a simpler question.`);
            }
          }
        }, AI_TIMEOUT_MS);

        // Execute Python script
        pythonProcess = spawn(pythonPath, [
          scriptPath,
          JSON.stringify({
            message: isStartingConversation ? "__START_CONVERSATION__" : userMessage,
            conversation_id: conversationId,
            context: context,
            is_starting: isStartingConversation
          })
        ]);
        
        let output = '';
        let errorOutput = '';
        
        // Collect data from script
        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          // We'll log this but not treat it as an error, since TensorFlow outputs warnings to stderr
          console.log(`Python diagnostic output: ${data.toString()}`);
        });
        
        // When script finishes
        pythonProcess.on('close', (code) => {
          clearTimeout(timeoutId);
          
          if (isResolved) return; // Already resolved by timeout
          isResolved = true;
          
          if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            if (errorOutput) {
              console.error(`Error output: ${errorOutput}`);
            }
            
            // Fallback to simulated response on error
            const fallbackResponse = `I received your message about "${userMessage}", but I'm currently experiencing technical difficulties.`;
            resolve(fallbackResponse);
          } else {
            try {
              // Clean the output - look for json object in the output string
              let cleanedOutput = output.trim();
              const jsonStartIndex = cleanedOutput.indexOf('{');
              if (jsonStartIndex > 0) {
                cleanedOutput = cleanedOutput.substring(jsonStartIndex);
              }
              
              if (!cleanedOutput || cleanedOutput.trim() === '') {
                console.warn('Empty output from Python script');
                resolve(`I received your message about "${userMessage}" but I'm having trouble generating a response.`);
                return;
              }
              
              const result = JSON.parse(cleanedOutput);
              resolve(result.response);
            } catch (e) {
              console.error('Failed to parse AI output:', e);
              console.error('Raw output:', output);
              
              // Fallback to simulated response on parsing error
              const fallbackResponse = `I understand your question about "${userMessage}", but I'm having trouble formulating a proper response.`;
              resolve(fallbackResponse);
            }
          }
        });
        
        // Handle process errors
        pythonProcess.on('error', (err) => {
          clearTimeout(timeoutId);
          if (!isResolved) {
            isResolved = true;
            console.error('Python process error:', err);
            resolve(`I received your message about "${userMessage}", but there was a problem with the AI processing.`);
          }
        });
        
      } catch (execError) {
        clearTimeout(timeoutId);
        if (!isResolved) {
          isResolved = true;
          console.error('Error executing Python script:', execError);
          
          // Fallback on execution error
          const fallbackResponse = `I received your message about "${userMessage}", but I'm experiencing technical difficulties.`;
          resolve(fallbackResponse);
        }
      }
    });
  } catch (error) {
    console.error('Error in AI processing:', error);
    return `I apologize, but I couldn't process your message: "${userMessage}" due to a system error.`;
  }
};

// Setup the AI bridge - call this during application startup
exports.setupAIBridge = () => {
  try {
    // Make sure the ai directory exists
    const aiDir = path.join(__dirname, '../ai');
    if (!fs.existsSync(aiDir)) {
      fs.mkdirSync(aiDir, { recursive: true });
    }
    
    console.log('AI bridge setup completed');
  } catch (error) {
    console.error('Failed to setup AI bridge:', error);
  }
};