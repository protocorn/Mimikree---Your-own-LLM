# Mimikree - Your Personalized AI Assistant

[Mimikree Website](https://mimikree.com/)

Mimikree is a powerful AI assistant platform that creates personalized AI models by understanding your unique needs, preferences, and goals through your data.

Contact me at: chordiasahil24@gmail.com

## 🌟 Features

- **Personalized AI Interaction**: Chat with an AI that understands your personal context and communication style
- **Multi-Platform Data Integration**:
  - GitHub integration
  - Twitter integration
  - LinkedIn integration
  - Medium integration
  - Reddit integration
  - Google Calendar integration
- **Document Processing**: Support for PDF uploads and parsing
- **Image Uploads**: Users can now upload images to further personalize their AI model.
- **Secure Authentication**: JWT-based user authentication system
- **Cloud Storage**: Image and file storage using Cloudinary
- **User Profiles**: Comprehensive user profiles with customizable settings
- **API Key Rotation**: Automatically handles rate limits by rotating between multiple Gemini API keys

## 🛠️ Technology Stack

### Backend Services
- **Node.js Server**:
  - Express.js framework
  - MongoDB database
  - JWT authentication
  - Various API integrations

- **LLaMA Server**:
  - Flask Python server
  - Pinecone vector database
  - Sentence transformers for embeddings
  - Hugging Face integration
  - Gemini 2.0 Flash API

### Frontend
- Modern responsive web interface
- Built with HTML5, CSS3, and JavaScript
- Integration with various third-party services

## 🚀 Getting Started

### Prerequisites
- Node.js (Latest LTS version)
- Python 3.13.1
- MongoDB
- Various API keys (see Environment Variables section)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/protocorn/Mimikree---Your-own-LLM
cd MyLLM
```

2. Install Node.js dependencies:
```bash
cd node_server
npm install
```

3. Install Python dependencies:
```bash
cd ../llama_server
pip install Flask pinecone sentence-transformers langchain-core waitress google-generativeai
```

4. Set up environment variables (see below)

5. Start the servers:
```bash
# Start Node.js server
cd node_server
node server.js

# Start LLaMA server
cd llama_server
python llama_service.py
```

### Environment Variables

Create `.env` files in both `node_server` and `llama_server` directories with the following variables:

#### Node Server
```
PORT=3000
NODE_ENV=test
MONGO_URI= <YOUR_MONGO_DB_URL>
JWT_SECRET_KEY=<YOUR_JWT_SECRET_KEY>
CLOUDINARY_CLOUD_NAME=<YOUR_CLOUD_NAME>
CLOUDINARY_API_KEY=<YOUR_CLOUDINARY_API_KEY>
CLOUDINARY_API_SECRET=<YOUR_CLOUDINARY_API_SECRET>
GOOGLE_CLIENT_ID=<YOUR_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET>
GOOGLE_REDIRECT_URI=http://localhost:3000
GOOGLE_CALENDAR_API_KEY=<YOUR_GOOGLE_CALENDAR_API_KEY>
GOOGLE_CALENDAR_DISCOVERY_DOC=https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.readonly
HUGGING_FACE_API_KEY=<YOUR_HUGGING_FACE_API_KEY>
HUGGING_FACE_API_URL=https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large
GITHUB_API_URL=https://api.github.com/
GITHUB_TOKEN=<YOUR_GITHUB_TOKEN>
GITHUB_USER_AGENT=<GITHUB_USERNAME>
REDDIT_CLIENT_ID=<YOUR_REDDIT_CLIENT_ID>
REDDIT_CLIENT_SECRET=<YOUR_REDDIT_CLIENT_SECRET>
REDDIT_USERNAME=<REDDIT_USERNAME>
REDDIT_PASSWORD=<YOUR_REDDIT_PASSWORD>
REDDIT_USER_AGENT=<YOUR_REDDIT_USER_AGENT>
REDDIT_REDIRECT_URI=http://localhost:3000/
TWITTER_USERNAME=<YOUR_TWITTER_USERNAME>
TWITTER_PASSWORD=<YOUR_TWITTER_PASSWORD>
```

#### LLaMA Server
```
PINECONE_API_KEY=<YOUR_PINECONE_API_KEY>
GOOGLE_API_KEY= <YOUR_GEMINI_API_KEY>
# Optional additional Gemini API keys
# These will be used automatically by the key rotation system
# GOOGLE_API_KEY_2=<YOUR_SECOND_GEMINI_API_KEY>
# GOOGLE_API_KEY_3=<YOUR_THIRD_GEMINI_API_KEY>
# GOOGLE_API_KEY_4=<YOUR_FOURTH_GEMINI_API_KEY>
```

## 🌐 Deployment

The project is configured for deployment on various platforms:

- Node.js server: Vercel deployment configuration included
- LLaMA server: Fly.io deployment configuration included

## 🔄 API Key Rotation System

The application includes a built-in API key rotation system for Gemini API to handle rate limits:

- **Automatic Fallback**: When one API key reaches its rate limit (15 requests/minute on free tier), the system automatically switches to the next available key.
- **Load Distribution**: Distributes API requests across multiple keys to maximize throughput.
- **Error Handling**: Gracefully handles rate limit errors and retries with alternative keys.
- **Usage Tracking**: Monitors usage of each key to prevent rate limit errors.

### Adding API Keys

API keys can be added in two ways:
1. **Environment Variables**: Add keys to your `.env` file (as shown above).
2. **Direct Configuration**: Keys can also be directly configured in `llama_server/utils/gemini_key_manager.py`.

### Testing the Key Rotation

To test the key rotation system, run:
```bash
cd llama_server
python test_key_rotation.py
```

This will simulate a high volume of requests to demonstrate the automatic key rotation functionality.

## 🔒 Security

- CORS enabled
- JWT authentication
- Secure password hashing with bcrypt
- Environment variable protection
- Request rate limiting
- Security headers

## 📝 License

[GNU GPL V3.0](https://github.com/protocorn/Mimikree---Your-own-LLM?tab=GPL-3.0-1-ov-file)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
