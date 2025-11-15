import google.generativeai as genai
import time
from collections import deque
import os
from functools import wraps

class GeminiKeyManager:
    """
    A class to manage multiple Gemini API keys with rotation when rate limits are reached.
    This helps handle the 15 requests per minute limitation of the free tier.
    """
    
    def __init__(self, api_keys=None):
        """
        Initialize the key manager with a list of API keys.

        Args:
            api_keys: List of API keys to use. If None, will try to get from environment.
        """
        # If no keys provided, use the environment variable as the primary key
        if api_keys is None:
            primary_key = os.getenv('GOOGLE_API_KEY')
            if not primary_key:
                raise ValueError("No API keys provided and GOOGLE_API_KEY not found in environment")
            self.api_keys = [primary_key]
        else:
            self.api_keys = list(api_keys)

        # Ensure we have at least one key
        if not self.api_keys:
            raise ValueError("No API keys provided")

        # Create a deque for easy rotation of keys
        self.key_queue = deque(self.api_keys)

        # Track request timestamps for each key to calculate rate limits
        self.request_history = {key: [] for key in self.api_keys}

        # Set the current key
        self.current_key = self.key_queue[0]
        genai.configure(api_key=self.current_key)

        # Set rate limit (Gemini free tier: 15 per minute)
        self.rate_limit = 15
        self.rate_window = 60  # seconds
    
    def rotate_key(self):
        """
        Rotate to the next available API key.
        Returns the new key.
        """
        # Rotate the queue to get the next key
        self.key_queue.rotate(-1)
        self.current_key = self.key_queue[0]

        # Configure genai with the new key
        genai.configure(api_key=self.current_key)

        print(f"Rotated to next API key due to rate limiting")
        return self.current_key
    
    def _is_rate_limited(self, key):
        """
        Check if the given key is currently rate limited.
        Returns True if rate limited, False otherwise.
        """
        current_time = time.time()
        
        # Clean up old requests outside the rate window
        self.request_history[key] = [
            timestamp for timestamp in self.request_history[key]
            if current_time - timestamp < self.rate_window
        ]
        
        # Check if we've hit the rate limit
        return len(self.request_history[key]) >= self.rate_limit
    
    def get_available_key(self):
        """
        Get an available API key that's not rate limited.
        If all keys are rate limited, returns the least recently used key.
        """
        # Try each key in the queue
        for _ in range(len(self.key_queue)):
            if not self._is_rate_limited(self.current_key):
                return self.current_key
            self.rotate_key()

        # If all keys are rate limited, use the current one (it will be the least recently used)
        return self.current_key
    
    def record_request(self):
        """
        Record that a request was made with the current key.
        """
        self.request_history[self.current_key].append(time.time())
    
    def with_key_rotation(self, func):
        """
        Decorator to automatically handle API key rotation for rate limits.
        
        Usage:
            @key_manager.with_key_rotation
            def make_api_call(...):
                # Use genai API here
        """
        @wraps(func)
        def wrapper(*args, **kwargs):
            max_retries = len(self.api_keys)
            retries = 0
            
            while retries < max_retries:
                # Get an available key
                key = self.get_available_key()
                genai.configure(api_key=key)
                
                try:
                    # Record this request
                    self.record_request()
                    
                    # Call the function
                    return func(*args, **kwargs)
                    
                except Exception as e:
                    error_message = str(e).lower()

                    # Check if this is a rate limit error
                    if "rate limit" in error_message or "quota" in error_message:
                        retries += 1
                        if retries < max_retries:
                            print(f"Rate limit hit, rotating to next key. Retry {retries}/{max_retries}")
                            self.rotate_key()
                        else:
                            print("All API keys are rate limited. Raising exception.")
                            raise
                    else:
                        # If it's not a rate limit error, re-raise it
                        raise
            
            # If we've exhausted all retries
            raise Exception("All API keys are rate limited")
        
        return wrapper

# Lazy initialization - don't create the manager until it's accessed
_key_manager = None

def get_key_manager():
    """Get or create the singleton key manager instance."""
    global _key_manager
    if _key_manager is None:
        # Collect API keys from environment
        api_keys = [
            os.getenv('GOOGLE_API_KEY'),  # Original key from environment
            os.getenv('GOOGLE_API_KEY_2'),
            os.getenv('GOOGLE_API_KEY_3'),
            os.getenv('GOOGLE_API_KEY_4')
        ]
        # Filter out any None values in case the environment variable isn't set
        api_keys = [key for key in api_keys if key]

        # Create the manager
        _key_manager = GeminiKeyManager(api_keys)

    return _key_manager

# Property to access the key manager
@property
def key_manager():
    """Access the key manager singleton."""
    return get_key_manager()

# Export the decorator for easy use - this will be lazily initialized
def with_key_rotation(func):
    """Decorator wrapper that lazily initializes the key manager."""
    return get_key_manager().with_key_rotation(func) 