# Deploying to Fly.io with API Key Rotation

This guide will help you deploy the LLaMA server to Fly.io with the Gemini API key rotation system properly configured.

## Prerequisites

1. [Install the Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
2. Login to your Fly.io account: `fly auth login`
3. Have your Gemini API keys ready (you can use up to 9 keys)

## Deployment Steps

### 1. Prepare your project

Ensure your project has the correct file structure:
- The `utils` directory with `__init__.py` and `gemini_key_manager.py`
- Updated `Dockerfile` that uses `requirements.txt`
- The `fly.toml` configuration file

### 2. Set your API keys as secrets

Instead of hardcoding API keys, use Fly.io's secrets management to securely store your keys:

```bash
# Set your primary Gemini API key
fly secrets set GOOGLE_API_KEY=your_primary_api_key

# Set additional Gemini API keys for rotation
fly secrets set GOOGLE_API_KEY_2=your_second_api_key
fly secrets set GOOGLE_API_KEY_3=your_third_api_key
fly secrets set GOOGLE_API_KEY_4=your_fourth_api_key

# Set Pinecone API key
fly secrets set PINECONE_API_KEY=your_pinecone_api_key
```

You can set up to 9 Gemini API keys (GOOGLE_API_KEY to GOOGLE_API_KEY_9).

### 3. Deploy the application

```bash
# From the llama_server directory
fly deploy
```

If this is your first deployment, you'll be guided through creating a new app:

```bash
# For first-time deployment
fly launch
```

The system will use your `fly.toml` file for configuration and may ask additional questions.

### 4. Verify deployment

```bash
# Check that the app is running
fly status

# View application logs
fly logs
```

You should see log messages indicating the key manager was initialized with the correct number of keys:
```
Initialized key manager with X API keys
```

### 5. Test the API key rotation

You can monitor the logs to see key rotation in action:

```bash
fly logs
```

When rate limits are hit, you'll see logs like:
```
Rate limit hit, rotating to next key. Retry 1/X
Rotated to next API key due to rate limiting
```

## Troubleshooting

### API keys not being found

If you see an error about no API keys being found:

1. Check your secrets are properly set:
   ```bash
   fly secrets list
   ```

2. Ensure your application is using the correct environment variables:
   ```bash
   # If needed, restart the app to pick up new environment variables
   fly apps restart your-app-name
   ```

### Rate limits still being hit

If you're still experiencing rate limit issues:

1. Verify the key rotation is working by checking logs
2. Consider adjusting the rate limit parameters in `gemini_key_manager.py`
3. Add more API keys to increase your total request capacity

## Scaling

If you need more capacity, you can:

1. Add more API keys (up to 9 using the environment variable pattern)
2. Adjust the VM configuration in `fly.toml` for higher memory/CPU
3. Scale horizontally by adding more machines (requires additional configuration) 