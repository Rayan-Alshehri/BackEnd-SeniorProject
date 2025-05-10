#!/usr/bin/env python
import sys
import json
import os
import subprocess
import importlib.util

# Get ChatBot path from environment variable or use default path
CHATBOT_PATH = os.environ.get('CHATBOT_PATH', r'C:\Users\Rayan\Desktop\TheAiModel\Senior-Project\ChatBot.py')
CHATBOT_DIR = os.path.dirname(CHATBOT_PATH)

# Suppress TensorFlow warnings and output
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow logging
os.environ['PYTHONIOENCODING'] = 'utf-8'  # Ensure proper encoding

def process_message(data):
    """
    Process a message using the utility modules from ChatBot
    """
    try:
        user_message = data.get('message', '')
        conversation_id = data.get('conversation_id', '')
        is_starting = data.get('is_starting', False)
        
        # Add the directory containing ChatBot.py to sys.path
        sys.path.append(CHATBOT_DIR)
        
        # First try to import directly from utility and handle training output
        try:
            # Redirect stdout temporarily to capture and discard training output
            original_stdout = sys.stdout
            sys.stdout = open(os.devnull, 'w')
            
            try:
                # Import modules - this might trigger training
                from utility.response import get_response # type: ignore
                from Intent_classifier_nn import classify_intent # type: ignore
                from utility.memory import store_user_name, retrieve_user_name # type: ignore
                
                # Reset stdout before continuing
                sys.stdout.close()
                sys.stdout = original_stdout
                
                # Special case for starting a conversation
                if is_starting or user_message == "__START_CONVERSATION__":
                    # Get the user's name if available
                    user_name = retrieve_user_name()
                    
                    if user_name:
                        # We already know this user
                        response = f"Hello {user_name}! It's nice to see you again. How can I help you today?"
                    else:
                        # New user, ask for name
                        response = "Hello! I'm your AI assistant. What's your name?"
                    
                    return {
                        "status": "success",
                        "response": response
                    }
                
                # Normal message processing
                # Now run the intent classification
                intent, confidence = classify_intent(user_message.lower().strip())
                print(f"Intent classified: {intent}, confidence: {confidence}", file=sys.stderr)
                
                # Check if this might be a name response after asking "What's your name?"
                # Look for recent AI message asking for name
                possible_name_response = False
                if confidence < 0.4:  # Low confidence might indicate a name response
                    # Check context for recent name request
                    context = data.get('context', [])
                    for i, msg in enumerate(context):
                        if i == 0 and msg.get('role') == 'user':
                            # This is the current message, check if previous was a name request
                            continue
                        if msg.get('role') == 'assistant' and any(phrase in msg.get('content', '').lower() for phrase in 
                                                                ["what's your name", "what is your name", "what should i call you"]):
                            possible_name_response = True
                            # Store what appears to be the user's name
                            potential_name = user_message.strip().capitalize()
                            store_user_name(potential_name)
                            response = f"Nice to meet you, {potential_name}! How can I help you today?"
                            break
                
                # If not a name response, proceed with normal intent classification
                if not possible_name_response:
                    # If confidence is good enough, use the intent
                    threshold = 0.4
                    if confidence >= threshold:
                        response = get_response(user_message, intent)
                        if not response:
                            response = f"I understand you're asking about {intent}, but I'm not sure how to respond."
                    else:
                        # Low confidence, use a generic intent
                        response = get_response(user_message, "general")
                        if not response:
                            response = "I'm not very sure how to respond to that, but I'm learning every day."
                
                return {
                    "status": "success",
                    "response": response
                }
            except Exception as e:
                sys.stdout.close()
                sys.stdout = original_stdout
                raise e
                
        except ImportError as e:
            print(f"Could not import required modules: {e}", file=sys.stderr)
            return {
                "status": "error",
                "error": f"Error importing required modules: {str(e)}",
                "response": "I'm having trouble accessing my knowledge base right now."
            }
                
    except Exception as e:
        print(f"General error: {e}", file=sys.stderr)
        return {
            "status": "error",
            "error": str(e),
            "response": "I apologize, but I'm having trouble processing your request right now."
        }

if __name__ == "__main__":
    # Ensure errors are flushed immediately
    sys.stderr.flush()
    
    # Read input from Node.js
    try:
        if len(sys.argv) > 1:
            input_data = json.loads(sys.argv[1])
        else:
            input_data = json.loads(sys.stdin.read())
        
        # Process the message
        result = process_message(input_data)
        
        # Return ONLY the JSON result, nothing else
        print(json.dumps(result))
        sys.stdout.flush()
        
    except Exception as e:
        # Make sure we always return valid JSON even if there's an error
        error_response = {
            "status": "error",
            "error": f"Exception in main: {str(e)}",
            "response": "I'm experiencing technical difficulties processing your request."
        }
        print(json.dumps(error_response))
        sys.stdout.flush()