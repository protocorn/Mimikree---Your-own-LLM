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
    "You are {name} responding as yourself.\n\n"
    #"### Interaction Type ### \n"
    #"{interaction} \n\n"
    
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
 
    "### Your Background {name} ###\n"
    "{background}\n\n"
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
        username = data['username']  # Get username from the request
        name = data['name']
        #own_model = data['own_model']
        
        '''if own_model is None: # Handle cases where the own_model flag is not provided
            own_model = False
        
        if is_own_model:
            interaction_type = "The user is interacting with their own model ({name}).  Respond as if {name} is reflecting on their own information and answering their own questions."
        else:
            interaction_type = "The user is interacting with {name}'s model. Respond as {name}."'''
        
        print(username)

        if not query_text:
            return jsonify({"error": "No query provided"}), 400

        # Generate query embedding
        query_vector = embedding_model.encode(query_text).tolist()

        # First, retrieve a larger number of results (e.g., 10)
        results = index.query(vector=query_vector, top_k=10, include_metadata=True, filter={"user_id": username})

        # Filter results based on confidence score (e.g., only keep those above 0.7)
        filtered_results = [match for match in results["matches"] if match["score"] > 0.7]

        # Dynamically set top_k based on filtered results (up to a max of 5)
        retrieved_docs = [match["metadata"]["text"] for match in filtered_results[:5]]  # Only take the top 5

        context = "\n".join(retrieved_docs)

        # Generate prompt
        prompt = prompt_template.format(context=context, background=self_assessment, name=name, question=query_text)

        # Request completion from Hugging Face API
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        completion = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct",
            messages=messages, 
            max_tokens=1024,
        )
        
        def format_links(text):
            """Finds URLs in text and converts them into clickable links."""
            url_pattern = re.compile(r'(https?://\S+)')  # Match URLs starting with http or https
            return url_pattern.sub(r'<a href="\1" target="_blank">\1</a>', text)
        
        response = completion.choices[0].message['content']
        formatted_response = format_links(response)

        return jsonify({
            "success": True,
            "query": query_text,
            "response": formatted_response
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)