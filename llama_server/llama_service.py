from flask import Flask, request, jsonify, session
from pinecone import Pinecone, ServerlessSpec
import os
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from huggingface_hub import InferenceClient
import uuid  # Import uuid to generate unique IDs
import secrets
import re
from waitress import serve
import google.generativeai as genai  # Import Google's Gemini API
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))

index_name = "user-embeddings"
user_id = "1234(test)"


# Create index if it doesn't exist
if index_name not in pc.list_indexes().names():
    pc.create_index(index_name, dimension=768, metric="cosine", spec=ServerlessSpec(
        cloud='aws',
        region='us-east-1'
    ))

# Connect to Pinecone index
index = pc.Index(index_name)

# Initialize embedding model
embedding_model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")

# Structured prompt template
prompt_template = ChatPromptTemplate.from_template(
    "You are {name} responding as yourself.\n\n"
    "### Interaction Type ### \n"
    "{interaction} \n\n"

    "### Profile Information ###\n"
    "{context}\n\n"

    "### Instructions ###\n"
    "- Introduce yourself as {name} whenever necessary.\n"
    "- Respond as a real person, not as an AI.\n"
    "- Match the user's tone, phrasing, and vocabulary naturally.\n"
    "- If the user specifies a tone, style, or format, strictly follow it.\n"
    "- Ensure accuracy and do not assume facts beyond the given data.\n"
    "- If relevant information is unavailable, respond naturally without making up details.\n"
    "- Use Markdown formatting where appropriate (e.g., for lists, headings, code blocks, etc.) to structure your response and improve readability.\n\n"

    "### {name}'s Background ###\n"
    "{background}\n\n"
    
    "### Previous Conversation ###\n"
    "{history}\n\n"

    "### User's Current Question ###\n"
    "{question}\n\n"

    "### Your Response ###"
)

# Initialize Hugging Face InferenceClient
'''client = InferenceClient(
    provider="hf-inference",
    api_key="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"
)'''
# Initialize Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

@app.route('/process', methods=['POST'])
def process_document():
    """Receives GitHub & Twitter data and stores embeddings in Pinecone."""
    try:
        data = request.json
        document_text = data.get("document", "")
        user_id = data.get("username", "")

        if not document_text:
            return jsonify({"error": "No document provided"}), 400

        # Generate embedding for the document
        vector = embedding_model.encode(document_text).tolist()

        # Generate a unique document ID using UUID
        document_id = "doc_" + user_id + "_" + str(uuid.uuid4())

        # Store in Pinecone with a unique document ID
        index.upsert(vectors=[(
            document_id, vector, {"text": document_text, "user_id": user_id}
        )])

        print(f"Document stored with ID: {document_id}")

        return jsonify({"success": True, "message": "Document processed successfully"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask():
    try:
        data = request.json
        query_text = data['query']
        self_assessment = data['selfAssessment']
        username = data['username']
        name = data['name']
        my_model = data["own_model"]
        chat_history = data.get('chatHistory', [])  # Get chat history if provided

        if not query_text:
            return jsonify({"error": "No query provided"}), 400

        # Generate query embedding
        query_vector = embedding_model.encode(query_text).tolist()

        # Retrieve similar documents from Pinecone
        pinecone_results = index.query(vector=query_vector, top_k=3, include_metadata=True, filter={"user_id": username})
        retrieved_docs = [match["metadata"]["text"] for match in pinecone_results["matches"]]
        context = "\n".join(retrieved_docs)

        if my_model:
            interaction_type = (f"You are talking with your creator/owner. Respond in a more personal, familiar way since this is {username} who created you."
                              f"Note: When {username} says 'my' or 'mine', they are referring to their own things. "
                              )
        else:
            interaction_type = f"You are talking with someone who is not your creator. This is some user who is interacting with you"

        # Format chat history for context
        conversation_history = ""
        if chat_history:
            for msg in chat_history[-5:]:  # Include last 5 messages for context
                role = "User" if msg["role"] == "user" else "Assistant"
                conversation_history += f"{role}: {msg['content']}\n"
        
        print(conversation_history)

        prompt = prompt_template.format(
            context=context,
            background=self_assessment,
            name=name,
            question=query_text,
            interaction=interaction_type,
            history= conversation_history
        )

        if "cloudinary" in context:
            prompt += '''### Important note for Cloudinary Links ### 
When you encounter URLs that contain the word "cloudinary":
1. Return the URLs exactly as they are, without any modification
2. After each URL, add a brief one-line description of what the image shows
3. Place each URL on its own line, followed by its description
4. Do not add any formatting, markdown, or HTML tags to the URLs
5. Example format:
https://res.cloudinary.com/example1.jpg
This is a photo of a mountain landscape
https://res.cloudinary.com/example2.jpg
This image shows a portrait of a person'''

        # Request completion from Gemini
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        response = model.generate_content([prompt])
        
        # Log the response for debugging
        print("Model Response:", response.text)

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response.text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)