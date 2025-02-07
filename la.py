from flask import Flask, request, jsonify
from pinecone import Pinecone, ServerlessSpec
import os
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from huggingface_hub import InferenceClient
import uuid  

app = Flask(__name__)

# Initialize session storage for chat history
user_sessions = {}  # Format: { user_id: [ {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."} ] }

# Initialize Pinecone
pc = Pinecone(api_key="pcsk_7Y7zWN_6eRYCU5oqR1jqwLAiQSv416HtB792Q3fC2HP7YQ1uNGWQd48egSezYDjG7CmSod")
index_name = "user-embeddings"
user_id = "1234(test)"  # Replace with dynamic user ID

# Connect to Pinecone index
index = pc.Index(index_name)

# Initialize embedding model
embedding_model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")

# Structured prompt template
prompt_template = ChatPromptTemplate.from_template(
    "You are Sahil Chordia, responding as yourself.\n\n"
    "### Profile Information ###\n"
    "{context}\n\n"
    "### Conversation History ###\n"
    "{chat_history}\n\n"
    "### Instructions ###\n"
    "- Respond as a real person, not as an AI.\n"
    "- Match the user's tone, phrasing, and vocabulary naturally.\n"
    "- If the user specifies a tone, style, or format, strictly follow it.\n"
    "- Ensure accuracy and do not assume facts beyond the given data.\n"
    "- If relevant information is unavailable, respond naturally without making up details.\n\n"
    "### User's Question ###\n"
    "{question}\n\n"
    "### Your Response ###"
)

# Initialize Hugging Face InferenceClient
client = InferenceClient(provider="together",api_key="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")

@app.route('/ask', methods=['POST'])
def ask():
    """Handles user queries with conversational memory."""
    try:
        data = request.json
        query_text = data.get("query", "")
        user_id = data.get("user_id", "default_user")  # Unique user tracking

        if not query_text:
            return jsonify({"error": "No query provided"}), 400

        # Initialize session for user if not exists
        if user_id not in user_sessions:
            user_sessions[user_id] = []

        # Store user's question in session history
        user_sessions[user_id].append({"role": "user", "content": query_text})

        # Generate query embedding
        query_vector = embedding_model.encode(query_text).tolist()

        # Retrieve relevant stored knowledge from Pinecone
        pinecone_results = index.query(vector=query_vector, top_k=3, include_metadata=True, filter={"user_id": user_id})
        retrieved_docs = [match["metadata"]["text"] for match in pinecone_results["matches"]]
        context = "\n".join(retrieved_docs)

        # Retrieve last 5 messages from session history
        chat_history = user_sessions[user_id][-5:]  # Keeps memory window small

        # Format chat history as a string
        history_text = "\n".join([f"{m['role'].capitalize()}: {m['content']}" for m in chat_history])

        # Generate structured prompt
        prompt = prompt_template.format(context=context, chat_history=history_text, question=query_text)

        # Request completion from AI model
        messages = [{"role": m["role"], "content": m["content"]} for m in chat_history]
        messages.append({"role": "user", "content": prompt})

        completion = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct",
            messages=messages, 
            max_tokens=500
        )

        response = completion.choices[0].message['content']

        # Store AI response in session history
        user_sessions[user_id].append({"role": "assistant", "content": response})

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5002, debug=True)
