from flask import Flask, request, jsonify, session
from pinecone import Pinecone, ServerlessSpec
import os
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from huggingface_hub import InferenceClient
import uuid  # Import uuid to generate unique IDs
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(32) 

# Initialize Pinecone
pc = Pinecone(api_key="pcsk_7Y7zWN_6eRYCU5oqR1jqwLAiQSv416HtB792Q3fC2HP7YQ1uNGWQd48egSezYDjG7CmSod")

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
    "You are Sahil Chordia, responding as yourself.\n\n"
    "### Profile Information ###\n"
    "{context}\n\n"
    "### Instructions ###\n"
    "- Introduce yourself as Sahil Chordia.\n"
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
client = InferenceClient(
    provider="hf-inference",
    api_key="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"
)

@app.route('/process', methods=['POST'])
def process_document():
    """Receives GitHub & Twitter data and stores embeddings in Pinecone."""
    try:
        data = request.json
        document_text = data.get("document", "")

        if not document_text:
            return jsonify({"error": "No document provided"}), 400

        # Generate embedding for the document
        vector = embedding_model.encode(document_text).tolist()
        
        name = "Sahil Chordia"

        # Generate a unique document ID using UUID
        document_id = "doc_" + user_id + "_" + name + "_" + str(uuid.uuid4())

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
    """Handles user queries based on stored GitHub & Twitter data, with local chat history."""
    try:
        data = request.json
        query_text = data.get("query", "")

        if not query_text:
            return jsonify({"error": "No query provided"}), 400

        # Retrieve or initialize chat history in session
        if "chat_history" not in session:
            session["chat_history"] = []

        # Generate query embedding
        query_vector = embedding_model.encode(query_text).tolist()

        # Retrieve similar documents from Pinecone
        pinecone_results = index.query(vector=query_vector, top_k=3, include_metadata=True, filter={"user_id": user_id})

        retrieved_docs = [match["metadata"]["text"] for match in pinecone_results["matches"]]
        context = "\n".join(retrieved_docs)

        # Format chat history
        history = "\n".join([f"User: {entry['user']}\nAssistant: {entry['assistant']}" for entry in session["chat_history"]])

        # Generate prompt with chat history
        prompt = prompt_template.format(context=context, question=query_text)

        # Request completion from Hugging Face API
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        completion = client.chat.completions.create(
            model="meta-llama/Llama-3.1-70B-Instruct",
            messages=messages, 
            max_tokens=500
        )

        response = completion.choices[0].message['content']

        # Update session chat history
        session["chat_history"].append({"user": query_text, "assistant": response})

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5002, debug=True)