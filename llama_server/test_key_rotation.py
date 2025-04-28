import time
import google.generativeai as genai
from utils.gemini_key_manager import key_manager, with_key_rotation

# Function to make a Gemini API call with key rotation
@with_key_rotation
def generate_response(prompt):
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content([prompt])
    return response.text

# Function to simulate a high number of requests to trigger rotation
def test_key_rotation():
    print("Testing Gemini API Key Rotation")
    print(f"Available API keys: {len(key_manager.api_keys)}")
    
    test_prompt = "how are you?"
    
    # Make multiple requests in quick succession to trigger rotation
    for i in range(20):  # More than our 15 per minute limit for a single key
        print(f"\nRequest {i+1}:")
        print(f"Using API key: {key_manager.current_key[:12]}...")  # Show only first part for security
        
        try:
            start_time = time.time()
            response = generate_response(test_prompt)
            end_time = time.time()
            
            print(f"Response: {response}")
            print(f"Time taken: {end_time - start_time:.2f} seconds")
            
            # Small delay to make output readable
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Error: {e}")
    
    print("\nTest completed.")
    print(f"Request history stats:")
    for key, requests in key_manager.request_history.items():
        print(f"Key {key[:12]}...: {len(requests)} requests")

if __name__ == "__main__":
    test_key_rotation() 