# Mimikree External API Documentation

## Overview
This API allows external applications (like your resume tailoring app) to authenticate users with their Mimikree credentials and query their personal AI chatbot with multiple questions.

## Base URL
- **Local Development**: `http://localhost:3000`
- **Production**: `https://www.mimikree.com` (when you're ready to deploy)

## Running Locally

### Prerequisites
1. Node.js and npm installed
2. MongoDB running locally or connection to MongoDB Atlas
3. Python environment for the LLama server

### Setup Steps

#### 1. Start MongoDB (if running locally)
```bash
mongod
```

#### 2. Start the LLama Server (Python)
```bash
cd llama_server
python llama_service.py
```
The LLama server will run on `http://localhost:8080`

#### 3. Configure Environment
Make sure your `.env` file in `node_server` has:
```env
NODE_ENV=test
MONGO_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_secret_key
# ... other environment variables
```

#### 4. Start the Node Server
```bash
cd node_server
npm install  # First time only
node server.js
```
The Node server will run on `http://localhost:3000`

## API Endpoints

### 1. Authentication Endpoint

**Endpoint**: `POST /api/external/authenticate`

**Description**: Validates Mimikree user credentials and returns the username for subsequent API calls.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "username": "johndoe",
  "name": "John Doe",
  "message": "Authentication successful"
}
```

**Error Responses**:
- `400 Bad Request`: Missing email or password
  ```json
  {
    "success": false,
    "message": "Email and password are required"
  }
  ```

- `401 Unauthorized`: Invalid credentials
  ```json
  {
    "success": false,
    "message": "Invalid credentials"
  }
  ```

- `500 Internal Server Error`: Server error
  ```json
  {
    "success": false,
    "message": "Internal server error"
  }
  ```

**Rate Limit**: 5 requests per 15 minutes per IP

---

### 2. Batch Questions Endpoint

**Endpoint**: `POST /api/external/batch-questions`

**Description**: Send multiple questions to a user's Mimikree chatbot and receive personalized responses based on their profile data.

**Request Body**:
```json
{
  "username": "johndoe",
  "questions": [
    "How proficient are you in Java? If yes, what projects have you built?",
    "Do you have experience with React?",
    "What is your strongest programming language?"
  ]
}
```

**Parameters**:
- `username` (string, required): The Mimikree username obtained from authentication
- `questions` (array of strings, required): Array of questions to ask (max 20 questions per request)

**Success Response** (200 OK):
```json
{
  "success": true,
  "username": "johndoe",
  "totalQuestions": 3,
  "successfulResponses": 3,
  "responses": [
    {
      "question": "How proficient are you in Java? If yes, what projects have you built?",
      "success": true,
      "answer": "I'm quite proficient in Java. I've built several projects including a task management system and a REST API for an e-commerce platform. The e-commerce API handles product inventory, user authentication, and payment processing."
    },
    {
      "question": "Do you have experience with React?",
      "success": true,
      "answer": "Yes, I have extensive experience with React. I've built multiple single-page applications and have a portfolio website showcasing my work."
    },
    {
      "question": "What is your strongest programming language?",
      "success": true,
      "answer": "My strongest programming language is JavaScript. I've been working with it for several years across both frontend and backend development."
    }
  ]
}
```

**Response Format**:
Each question in the `responses` array contains:
- `question`: The original question asked
- `success`: Boolean indicating if the question was processed successfully
- `answer`: The chatbot's response (only present if `success` is true)
- `error`: Error message (only present if `success` is false)

**Error Responses**:

- `400 Bad Request`: Invalid input
  ```json
  {
    "success": false,
    "message": "Username is required"
  }
  ```
  or
  ```json
  {
    "success": false,
    "message": "Questions array is required and must not be empty"
  }
  ```
  or
  ```json
  {
    "success": false,
    "message": "Maximum 20 questions allowed per request"
  }
  ```

- `404 Not Found`: User doesn't exist
  ```json
  {
    "success": false,
    "message": "User not found"
  }
  ```

- `500 Internal Server Error`: Server error
  ```json
  {
    "success": false,
    "message": "Error processing batch questions",
    "error": "Error details"
  }
  ```

**Rate Limit**: 100 requests per minute per IP

---

## Usage Example for Resume Tailoring App

### Step 1: Authenticate User
```javascript
async function authenticateUser(email, password) {
  const response = await fetch('http://localhost:3000/api/external/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (data.success) {
    return data.username;
  } else {
    throw new Error(data.message);
  }
}
```

### Step 2: Ask Batch Questions
```javascript
async function askBatchQuestions(username, questions) {
  const response = await fetch('http://localhost:3000/api/external/batch-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, questions })
  });

  const data = await response.json();

  return data;
}
```

### Step 3: Complete Workflow
```javascript
async function enhanceResumeWithMimikree(email, password, questions) {
  try {
    // Step 1: Authenticate
    const username = await authenticateUser(email, password);
    console.log('Authenticated as:', username);

    // Step 2: Get answers from Mimikree chatbot
    const result = await askBatchQuestions(username, questions);

    console.log(`Successfully processed ${result.successfulResponses}/${result.totalQuestions} questions`);

    // Step 3: Use the responses to enhance resume
    result.responses.forEach(response => {
      if (response.success) {
        console.log('Q:', response.question);
        console.log('A:', response.answer);
        // Use this information to enhance the resume
      }
    });

    return result;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// Example usage
const questionsToAsk = [
  "How proficient are you in Java? If yes, what projects have you built?",
  "Do you have experience with cloud platforms like AWS or Azure?",
  "What are your key achievements in your previous roles?"
];

enhanceResumeWithMimikree(
  'user@example.com',
  'userpassword',
  questionsToAsk
);
```

## Security Considerations

1. **Never store passwords**: Only use credentials for authentication, don't store them
2. **Store username securely**: After authentication, store the username securely (encrypted or in secure storage)
3. **Rate limiting**: The API has built-in rate limiting to prevent abuse
4. **HTTPS in production**: Always use HTTPS in production environments
5. **Input validation**: Always validate user inputs before sending to the API

## Privacy & Data Usage

- **No chat history stored**: Batch questions don't create chat history records
- **Memory disabled**: External queries don't trigger the memory storage system
- **Public data only**: Only public profile information is used for responses
- **No authentication tokens**: We don't use JWT tokens for external API to keep it simple

## Error Handling Best Practices

```javascript
async function callAPIWithRetry(username, questions, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/external/batch-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, questions })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error.message);

      if (i === maxRetries - 1) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

## Testing the API

### Using cURL

**Test Authentication**:
```bash
curl -X POST http://localhost:3000/api/external/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "userpassword"
  }'
```

**Test Batch Questions**:
```bash
curl -X POST http://localhost:3000/api/external/batch-questions \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "questions": [
      "How proficient are you in Java?",
      "What is your experience with React?"
    ]
  }'
```

### Using Postman

1. Create a new POST request
2. Set URL to `http://localhost:3000/api/external/authenticate`
3. Set Headers: `Content-Type: application/json`
4. Set Body (raw JSON):
   ```json
   {
     "email": "user@example.com",
     "password": "userpassword"
   }
   ```
5. Send request and save the username
6. Create another POST request to `http://localhost:3000/api/external/batch-questions`
7. Use the username from step 5 with your questions

## Support

For issues or questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Email: support@mimikree.com

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Authentication endpoint
- Batch questions endpoint
- Rate limiting
- Input validation
