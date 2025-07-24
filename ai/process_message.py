#!/usr/bin/env python3
import sys
import json
import os
import pickle


def unscramble_word(scrambled, difficulty):
    """Try to find the original word from a scrambled word."""
    # Load the word bank from word_scramble_game
    word_list = word_scramble_game.word_bank.get(difficulty, word_scramble_game.word_bank["medium"])
    
    # Sort the letters to create a unique fingerprint for each word
    sorted_scrambled = ''.join(sorted(scrambled.lower()))
    
    # Find matching words in the word bank
    for word in word_list:
        sorted_word = ''.join(sorted(word.lower()))
        if sorted_word == sorted_scrambled:
            return word
    
    # If no match found, return the first word from the list as a fallback
    return word_list[0] if word_list else "unknown"

def update_high_score(score):
    """Update and return the high score."""
    try:
        high_score = word_scramble_game.load_high_score()
        if score > high_score:
            word_scramble_game.save_high_score(score)
            return score
        return high_score
    except:
        return score
    
# Get the path to the ChatBot directory
CHATBOT_PATH = os.environ.get('CHATBOT_PATH', r'C:\Users\Rayan\Desktop\TheAiModel\Senior-Project')
CHATBOT_DIR = os.path.dirname(CHATBOT_PATH)

# Add paths to make imports work
sys.path.append(CHATBOT_PATH)
sys.path.append(CHATBOT_DIR)
sys.path.append(os.path.join(CHATBOT_PATH, 'utility'))
sys.path.append(os.path.join(CHATBOT_DIR, 'utility'))

print(f"Python diagnostic output: Added paths to sys.path: {CHATBOT_PATH}, {CHATBOT_DIR}", file=sys.stderr)
print(f"Python diagnostic output: Current sys.path: {sys.path}", file=sys.stderr)

# Create a simple session store file
SESSION_STORE = os.path.join(os.path.dirname(__file__), 'chat_sessions.pkl')

# Function to load the session store
def load_sessions():
    if os.path.exists(SESSION_STORE):
        try:
            with open(SESSION_STORE, 'rb') as f:
                return pickle.load(f)
        except:
            return {}
    return {}

# Function to save the session store
def save_sessions(sessions):
    with open(SESSION_STORE, 'wb') as f:
        pickle.dump(sessions, f)

# Try to import modules
try:
    from utility.response import get_response, user_session
    from Intent_classifier_nn import classify_intent
    from utility.memory import retrieve_user_name
    import memory_game  # Import memory_game directly
    import word_scramble_game  # Import word_scramble_game directly
    print(f"Python diagnostic output: Successfully imported modules", file=sys.stderr)
except ImportError as e:
    print(f"Python diagnostic output: ImportError - {str(e)}", file=sys.stderr)
    # Try a different import path
    try:
        sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
        sys.path.append(os.path.dirname(__file__))
        from response import get_response, user_session
        from Intent_classifier_nn import classify_intent
        from memory import retrieve_user_name
        import memory_game  # Import memory_game directly
        import word_scramble_game  # Import word_scramble_game directly
        print(f"Python diagnostic output: Successfully imported modules using alternate path", file=sys.stderr)
    except ImportError as e2:
        print(f"Python diagnostic output: Second ImportError - {str(e2)}", file=sys.stderr)
        
        # Return a simple error response
        error_response = {
            "status": "error",
            "response": "I'm having trouble accessing my knowledge. Please try again later."
        }
        print(json.dumps(error_response))
        sys.stdout.flush()
        sys.exit(1)

def main():
    try:
        # Read input
        if len(sys.argv) > 1:
            payload = json.loads(sys.argv[1])
        else:
            payload = json.load(sys.stdin)
        
        # Extract message and conversation ID
        message = None
        conversation_id = None
        
        if "message" in payload:
            message = payload["message"]
        elif "data" in payload and "userMessage" in payload["data"] and "content" in payload["data"]["userMessage"]:
            message = payload["data"]["userMessage"]["content"]
            if "conversation_id" in payload["data"]["userMessage"]:
                conversation_id = payload["data"]["userMessage"]["conversation_id"]
        
        if "conversation_id" in payload:
            conversation_id = payload["conversation_id"]
        
        print(f"Python diagnostic output: Processing message: '{message}' for conversation: {conversation_id}", file=sys.stderr)
        
        # Load session store
        sessions = load_sessions()
        
        # Get or create session for this conversation
        if conversation_id is not None:
            conv_id_str = str(conversation_id)
            if conv_id_str not in sessions:
                sessions[conv_id_str] = {
                    "game_state": {
                        "active": False,
                        "game": None,
                        "stage": None,
                        "data": {}
                    }
                }
            session = sessions[conv_id_str]
        else:
            session = {"game_state": {"active": False}}
        
        # Special case for conversation start
        if message == "__START_CONVERSATION__" or payload.get("is_starting", False):
            user_name = retrieve_user_name()
            
            if user_name:
                response = f"Hello {user_name}! It's nice to see you again. How can I help you today?"
            else:
                response = "Hello! I'm your friendly AI assistant. What's your name?"
            
            # Save session
            if conversation_id:
                save_sessions(sessions)
            
            result = {"status": "success", "response": response}
            print(json.dumps(result))
            sys.stdout.flush()
            return
        
        # Check if we're in an active game
        game_state = session["game_state"]
        
        # ================ MEMORY GAME LOGIC ================
        if game_state["active"] and game_state["game"] == "memory":
            # Memory game logic
            if game_state["stage"] == "awaiting_game":
                if "memory" in message.lower():
                    game_state["game"] = "memory"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Memory Game selected. Choose difficulty: easy, medium, or hard."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
            
            elif game_state["stage"] == "awaiting_difficulty":
                difficulty = message.lower().strip()
                if difficulty in ["easy", "medium", "hard"]:
                    game_state["data"]["difficulty"] = difficulty
                    
                    # Call memory_game module directly to generate sequence
                    try:
                        print(f"Python diagnostic output: Generating sequence with difficulty: {difficulty}", file=sys.stderr)
                        memory_data = {
                            "difficulty": difficulty,
                            "score": game_state["data"].get("score", 0),
                            "rounds_played": game_state["data"].get("rounds_played", 0),
                            "play_again": "yes"
                        }
                        # Don't include user_sequence to get a sequence
                        
                        # Call memory_game.main directly
                        seq_response = memory_game.main(memory_data)
                        print(f"Python diagnostic output: Memory game response: {seq_response}", file=sys.stderr)
                        
                        if seq_response and "sequence" in seq_response:
                            game_state["data"]["sequence"] = seq_response["sequence"]
                            game_state["data"]["expected_sequence"] = seq_response["sequence"]
                            game_state["stage"] = "awaiting_sequence"
                            
                            # Format the response nicely
                            sequence_str = ' '.join(seq_response["sequence"])
                            response = f"Memory Game: {seq_response.get('message', 'Here\'s the sequence!')} The sequence is: {sequence_str}. You have {seq_response.get('display_time', 3)} seconds to memorize it! Type the sequence when ready."
                        else:
                            # Something went wrong
                            print(f"Python diagnostic output: No sequence in response: {seq_response}", file=sys.stderr)
                            response = "Sorry, I had trouble generating a sequence. Let's try again. Choose difficulty: easy, medium, or hard."
                    except Exception as e:
                        print(f"Python diagnostic output: Error in memory game: {str(e)}", file=sys.stderr)
                        response = "Sorry, I encountered an error with the memory game. Let's try again. Choose difficulty: easy, medium, or hard."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
                else:
                    response = "Please choose a valid difficulty: easy, medium, or hard."
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
            
            elif game_state["stage"] == "awaiting_sequence":
                # User is entering the sequence
                user_sequence = message.split()
                
                # Instead of calling memory_game.main(), let's directly check the sequence
                try:
                    print(f"Python diagnostic output: Checking sequence: {user_sequence} against {game_state['data']['expected_sequence']}", file=sys.stderr)
                    
                    expected_sequence = game_state["data"]["expected_sequence"]
                    is_correct = user_sequence == expected_sequence
                    
                    # Update score
                    if is_correct:
                        game_state["data"]["score"] += 1
                    game_state["data"]["rounds_played"] += 1
                    
                    # Format the response
                    result_msg = "Correct! Nice one!" if is_correct else "Incorrect! Better luck next time!"
                    
                    # Add warning if length doesn't match
                    if len(user_sequence) != len(expected_sequence):
                        result_msg += f" Expected {len(expected_sequence)} items, but got {len(user_sequence)}."
                    
                    result_msg += f" Your score: {game_state['data']['score']}/{game_state['data']['rounds_played']}"
                    
                    # Ask for another round
                    game_state["stage"] = "awaiting_play_again"
                    result_msg += " Want to play another round? (yes/no)"
                    
                    response = result_msg
                except Exception as e:
                    print(f"Python diagnostic output: Error checking sequence: {str(e)}", file=sys.stderr)
                    response = "Sorry, I encountered an error checking your sequence. Want to play again? (yes/no)"
                    game_state["stage"] = "awaiting_play_again"
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
            
            elif game_state["stage"] == "awaiting_play_again":
                if message.lower() in ["yes", "y", "yeah", "sure", "ok"]:
                    game_state["stage"] = "awaiting_difficulty"
                    response = "Great! Choose difficulty for the next round: easy, medium, or hard."
                else:
                    # End the game
                    game_state["active"] = False
                    game_state["game"] = None
                    game_state["stage"] = None
                    response = f"Thanks for playing! Your final score was {game_state['data'].get('score', 0)}/{game_state['data'].get('rounds_played', 0)}. What would you like to do next?"
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
        
        # ================ WORD SCRAMBLE GAME LOGIC ================
        elif game_state["active"] and game_state["game"] == "word_scramble":
            if game_state["stage"] == "awaiting_difficulty":
                difficulty = message.lower().strip()
                if difficulty in ["easy", "medium", "hard"]:
                    # Initialize game with difficulty
                    game_state["data"]["difficulty"] = difficulty
                    
                    try:
                        # Call word_scramble_game directly to get a scrambled word
                        print(f"Python diagnostic output: Starting word scramble with difficulty: {difficulty}", file=sys.stderr)
                        scramble_data = {
                            "difficulty": difficulty,
                            "score": game_state["data"].get("score", 0),
                            "rounds_played": game_state["data"].get("rounds_played", 0)
                        }
                        
                        # Get scrambled word
                        game_result = word_scramble_game.main(scramble_data)
                        print(f"Python diagnostic output: Word scramble response: {game_result}", file=sys.stderr)
                        
                        if game_result and "scrambled_word" in game_result:
                            game_state["data"]["scrambled_word"] = game_result["scrambled_word"]
                            game_state["data"]["high_score"] = game_result.get("high_score", 0)
                            game_state["data"]["attempts_left"] = 3  # Word scramble gives 3 attempts
                            game_state["data"]["hint_used"] = False
                            game_state["stage"] = "awaiting_guess"
                            
                            response = f"Word Scramble: {game_result['message']} (Difficulty: {difficulty}). You have 3 attempts. Type 'hint' for a hint."
                        else:
                            # Something went wrong
                            print(f"Python diagnostic output: Error in word scramble: {game_result}", file=sys.stderr)
                            response = "Sorry, I had trouble starting the Word Scramble game. Let's try again. Choose difficulty: easy, medium, or hard."
                    except Exception as e:
                        print(f"Python diagnostic output: Error in word scramble: {str(e)}", file=sys.stderr)
                        response = "Sorry, I encountered an error with the Word Scramble game. Let's try again. Choose difficulty: easy, medium, or hard."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
                else:
                    response = "Please choose a valid difficulty: easy, medium, or hard."
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
            
            elif game_state["stage"] == "awaiting_guess":
                guess = message.lower().strip()
                
                try:
                    print(f"Python diagnostic output: Processing guess: {guess}", file=sys.stderr)
                    
                    # Handle hint request
                    if guess.lower() == "hint" and not game_state["data"].get("hint_used", False):
                        # User asked for a hint
                        scrambled_word = game_state["data"]["scrambled_word"]
                        print(f"Python diagnostic output: User requested hint for {scrambled_word}", file=sys.stderr)
                        
                        # Get the original word through our unscramble function
                        difficulty = game_state["data"]["difficulty"]
                        original_word = unscramble_word(scrambled_word, difficulty)
                        
                        if original_word and len(original_word) > 0:
                            first_letter = original_word[0]
                            game_state["data"]["hint_used"] = True
                            game_state["data"]["hint"] = first_letter
                            response = f"Word Scramble: Hint - the word starts with '{first_letter}'. You have {game_state['data']['attempts_left']} attempts left."
                        else:
                            response = f"Word Scramble: Sorry, I couldn't generate a hint. You have {game_state['data']['attempts_left']} attempts left."
                    else:
                        # Regular guess
                        scrambled_word = game_state["data"]["scrambled_word"]
                        original_word = unscramble_word(scrambled_word, game_state["data"]["difficulty"])
                        
                        print(f"Python diagnostic output: Original word for '{scrambled_word}' is '{original_word}'", file=sys.stderr)
                        
                        # Check if guess is correct
                        is_correct = (guess.lower() == original_word.lower()) if original_word else False
                        
                        # Update attempts and score
                        attempts_left = game_state["data"]["attempts_left"] - 1
                        game_state["data"]["attempts_left"] = attempts_left
                        
                        if is_correct:
                            game_state["data"]["score"] = game_state["data"].get("score", 0) + 1
                            game_state["data"]["rounds_played"] = game_state["data"].get("rounds_played", 0) + 1
                            high_score = update_high_score(game_state["data"]["score"])
                            response = f"Word Scramble: Correct! Exceptional! Your score: {game_state['data']['score']}. The high score is {high_score}. Want to play another round? (yes/no)"
                            game_state["stage"] = "awaiting_play_again"
                        elif attempts_left <= 0:
                            # Out of attempts
                            game_state["data"]["rounds_played"] = game_state["data"].get("rounds_played", 0) + 1
                            response = f"Word Scramble: Game over! The word was '{original_word}'. Your score: {game_state['data']['score']}. Want to play another round? (yes/no)"
                            game_state["stage"] = "awaiting_play_again"
                        else:
                            # Wrong but still have attempts
                            response = f"Word Scramble: Incorrect! You have {attempts_left} attempts left."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
                    
                except Exception as e:
                    print(f"Python diagnostic output: Error processing guess: {str(e)}", file=sys.stderr)
                    response = "Sorry, I encountered an error processing your guess. Want to play another round? (yes/no)"
                    game_state["stage"] = "awaiting_play_again"
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
                                    
                    # Process the guess
                    result_response = word_scramble_game.main(scramble_data)
                    print(f"Python diagnostic output: Word scramble result: {result_response}", file=sys.stderr)
                    
                    if result_response:
                        # Update game state from result
                        game_state["data"]["attempts_left"] = result_response.get("attempts_left", 0)
                        game_state["data"]["hint_used"] = result_response.get("hint_used", False)
                        
                        if "score" in result_response:
                            game_state["data"]["score"] = result_response["score"]
                        
                        if "rounds_played" in result_response:
                            game_state["data"]["rounds_played"] = result_response["rounds_played"]
                        
                        # If hint was requested
                        if guess.lower() == "hint" and result_response.get("hint"):
                            response = f"Word Scramble: {result_response['message']} You have {game_state['data']['attempts_left']} attempts left."
                        elif result_response.get("correct", False):
                            # If correct answer
                            response = f"Word Scramble: {result_response['message']} Your score: {game_state['data']['score']}. The high score is {result_response.get('high_score', 0)}. Want to play another round? (yes/no)"
                            game_state["stage"] = "awaiting_play_again"
                        elif game_state["data"]["attempts_left"] <= 0:
                            # Game over - no attempts left
                            original_word = result_response.get("original_word", "")
                            response = f"Word Scramble: Game over! The word was '{original_word}'. Your score: {game_state['data']['score']}. The high score is {result_response.get('high_score', 0)}. Want to play another round? (yes/no)"
                            game_state["stage"] = "awaiting_play_again"
                        else:
                            # Incorrect but with attempts left
                            response = f"Word Scramble: {result_response['message']} You have {game_state['data']['attempts_left']} attempts left."
                    else:
                        # Something went wrong
                        response = "Sorry, I had trouble processing your guess. You can try again or type 'quit' to exit the game."
                
                except Exception as e:
                    print(f"Python diagnostic output: Error processing guess: {str(e)}", file=sys.stderr)
                    response = "Sorry, I encountered an error processing your guess. Want to play another round? (yes/no)"
                    game_state["stage"] = "awaiting_play_again"
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
            
            elif game_state["stage"] == "awaiting_play_again":
                if message.lower() in ["yes", "y", "yeah", "sure", "ok"]:
                    game_state["stage"] = "awaiting_difficulty"
                    response = "Great! Choose difficulty for the next round: easy, medium, or hard."
                else:
                    # End the game
                    game_state["active"] = False
                    game_state["game"] = None
                    game_state["stage"] = None
                    response = f"Thanks for playing Word Scramble! Your final score was {game_state['data'].get('score', 0)}. What would you like to do next?"
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
        
        # ================ GAME SELECTION LOGIC ================
        # Classify intent for non-game-specific messages
        # Classify intent for non-game-specific messages
        intent, confidence = classify_intent(message.lower().strip())
        print(f"Python diagnostic output: Intent: {intent}, confidence: {confidence}", file=sys.stderr)

        # Override intent for specific game mentions regardless of classification
        message_lower = message.lower().strip()
        if (any(game in message_lower for game in ["memory game", "word scramble", "scramble game", "tic tac toe", "tictactoe", "chess game"]) or 
            message_lower in ["memory", "scramble", "chess"]):
            print(f"Python diagnostic output: Overriding intent to game_related due to game name mention", file=sys.stderr)
            intent = "game_related"
            confidence = 1.0
        
        # Handle game-related intents
        if intent == "game_related":
            # Check for game initialization
            if any(word in message.lower() for word in ["play", "game", "let's"]):
                # User wants to play a game - check for specific game mention
                if "memory" in message.lower():
                    # Jump straight to memory game
                    game_state["active"] = True
                    game_state["game"] = "memory"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Memory Game selected. Choose difficulty: easy, medium, or hard."
                elif "scramble" in message.lower() or "word" in message.lower():
                    # Jump straight to word scramble
                    game_state["active"] = True
                    game_state["game"] = "word_scramble"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Word Scramble game selected. Choose difficulty: easy, medium, or hard."
                else:
                    # Show game menu
                    game_state["active"] = True
                    game_state["game"] = None
                    game_state["stage"] = "awaiting_game"
                    response = "I have four games: Memory game, Word Scramble game, Chess game, and Tic Tac Toe game. Which one would you like to play?"
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
            
            # Handle game selection from menu
            if game_state["active"] and game_state["stage"] == "awaiting_game":
                game_choice = message.lower().strip()
                
                if "memory" in game_choice:
                    game_state["game"] = "memory"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Memory Game selected. Choose difficulty: easy, medium, or hard."
                elif "scramble" in game_choice or "word" in game_choice:
                    game_state["game"] = "word_scramble"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Word Scramble game selected. Choose difficulty: easy, medium, or hard."
                elif any(word in game_choice for word in ["tic", "tac", "toe"]):
                    response = "Tic Tac Toe game is coming soon! Would you like to try Memory Game or Word Scramble instead?"
                elif "chess" in game_choice:
                    response = "Chess game is coming soon! Would you like to try Memory Game or Word Scramble instead?"
                else:
                    response = "I don't recognize that game. Please choose Memory game, Word Scramble game, Chess game, or Tic Tac Toe game."
                
                # Save session
                if conversation_id:
                    save_sessions(sessions)
                
                result = {"status": "success", "response": response}
                print(json.dumps(result))
                sys.stdout.flush()
                return
            
            # For direct game selection (if not in a game flow)
            if not game_state["active"]:
                game_choice = message.lower().strip()

                if "memory" in game_choice:
                    game_state["active"] = True
                    game_state["game"] = "memory"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Memory Game selected. Choose difficulty: easy, medium, or hard."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
                elif "scramble" in game_choice or ("word" in game_choice and any(w in game_choice for w in ["game", "scramble"])):
                    game_state["active"] = True
                    game_state["game"] = "word_scramble"
                    game_state["stage"] = "awaiting_difficulty"
                    game_state["data"] = {"score": 0, "rounds_played": 0}
                    response = "Great! Word Scramble game selected. Choose difficulty: easy, medium, or hard."
                    
                    # Save session
                    if conversation_id:
                        save_sessions(sessions)
                    
                    result = {"status": "success", "response": response}
                    print(json.dumps(result))
                    sys.stdout.flush()
                    return
        
        # For non-game-related intents or fallback
        response = get_response(message, intent)
        
        # Format dictionary responses
        if isinstance(response, dict):
            response = str(response)
        
        # Save session
        if conversation_id:
            save_sessions(sessions)
        
        # Return the response
        result = {"status": "success", "response": response}
        print(json.dumps(result))
        sys.stdout.flush()
        
    except Exception as e:
        import traceback
        error_info = traceback.format_exc()
        print(f"Python diagnostic output: ERROR: {str(e)}\n{error_info}", file=sys.stderr)
        
        error_response = {
            "status": "error",
            "error": str(e),
            "response": "I'm sorry, I encountered an error processing your request."
        }
        print(json.dumps(error_response))
        sys.stdout.flush()

if __name__ == "__main__":
    main()