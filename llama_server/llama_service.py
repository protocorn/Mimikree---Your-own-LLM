from flask import Flask, request, jsonify, session
from pinecone import Pinecone, ServerlessSpec
import os
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain_community.vectorstores import Pinecone as LangchainPinecone
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain.chains.query_constructor.base import AttributeInfo
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.llms import HuggingFaceHub
from huggingface_hub import InferenceClient
import uuid  # Import uuid to generate unique IDs
import secrets
import re
from waitress import serve
import google.generativeai as genai  # Import Google's Gemini API
from dotenv import load_dotenv
import numpy as np

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
langchain_embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")

# Initialize Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

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

# Combined query analysis prompt (expansion + complexity assessment)
query_analysis_prompt = PromptTemplate.from_template(
"""Based on the current query and conversation history, perform two tasks:

1. Generate an expanded query that captures the full context of what the user is seeking.
2. Determine how many relevant documents would be needed to provide a comprehensive answer (between 1-15).

Current Query: {query}
Conversation History:
{history}

Return your response in this exact format:
EXPANDED_QUERY: [your expanded query]
DOCUMENT_COUNT: [number between 1-15]"""
)

# Perform combined query analysis: expansion and complexity assessment
def analyze_query(query_text, conversation_history=""):
    """Expand query using conversation history and assess optimal document count in a single call"""
    try:
        prompt = query_analysis_prompt.format(
            query=query_text,
            history=conversation_history
        )
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([prompt])
        
        response_text = response.text.strip()
        
        # Extract expanded query
        expanded_query_match = re.search(r'EXPANDED_QUERY:\s*(.*?)(?:\n|$)', response_text)
        expanded_query = expanded_query_match.group(1).strip() if expanded_query_match else query_text
        
        # Extract document count
        doc_count_match = re.search(r'DOCUMENT_COUNT:\s*(\d+)', response_text)
        doc_count = int(doc_count_match.group(1)) if doc_count_match else 3
        doc_count = min(max(doc_count, 1), 15)  # Ensure between 1-15
        
        return expanded_query, doc_count
    except Exception as e:
        print(f"Error in query analysis: {e}")
        return query_text, 3  # Default values on error

# Function to calculate cosine similarity between two vectors
def cosine_similarity(vec1, vec2):
    """Calculate cosine similarity between two vectors"""
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = sum(a * a for a in vec1) ** 0.5
    norm2 = sum(b * b for b in vec2) ** 0.5
    
    if norm1 == 0 or norm2 == 0:
        return 0
    
    return dot_product / (norm1 * norm2)

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

        # Format chat history for context
        conversation_history = ""
        if chat_history:
            for msg in chat_history[-5:]:  # Include last 5 messages for context
                role = "User" if msg["role"] == "user" else "Assistant"
                conversation_history += f"{role}: {msg['content']}\n"
        
        # PHASE 1: Combined query expansion and complexity assessment
        expanded_query, optimal_doc_count = analyze_query(query_text, conversation_history)
        print(f"Original query: {query_text}")
        print(f"Expanded query: {expanded_query}")
        print(f"Determined optimal document count: {optimal_doc_count}")
        
        # PHASE 2: Initial retrieval
        # Generate query embedding
        query_vector = embedding_model.encode(expanded_query).tolist()
        original_query_vector = embedding_model.encode(query_text).tolist()
        
        # Create a weighted average of the two vectors (70% expanded, 30% original)
        hybrid_vector = [0.7 * e + 0.3 * o for e, o in zip(query_vector, original_query_vector)]
        
        # Normalize the hybrid vector
        norm = np.sqrt(sum([x*x for x in hybrid_vector]))
        if norm > 0:
            normalized_hybrid_vector = [x/norm for x in hybrid_vector]
        else:
            normalized_hybrid_vector = hybrid_vector
        
        # Retrieve documents
        pinecone_results = index.query(
            vector=normalized_hybrid_vector, 
            top_k=optimal_doc_count * 2,  # Get 2x optimal count for filtering
            include_metadata=True, 
            filter={"user_id": username}
        )
        
        # PHASE 3: Re-rank documents based on vector similarity to user query
        retrieved_docs = []
        
        for match in pinecone_results["matches"]:
            doc_text = match["metadata"]["text"]
            doc_vector = match["values"]
            
            # Calculate similarity to original query (gives more weight to exact matches)
            similarity = cosine_similarity(original_query_vector, doc_vector)
            
            # Scale similarity to 0-10 range
            relevance_score = similarity * 10
            
            retrieved_docs.append((doc_text, relevance_score))
        
        # Sort by relevance score (descending)
        retrieved_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Only keep top k most relevant documents
        final_docs = [doc[0] for doc in retrieved_docs[:optimal_doc_count]]
        
        # Join the documents into a single context
        context = "\n".join(final_docs)

        if my_model:
            interaction_type = (f"You are talking with your creator/owner. Respond in a more personal, familiar way since this is {username} who created you."
                              f"Note: When {username} says 'my' or 'mine', they are referring to their own things. "
                              )
        else:
            interaction_type = f"You are talking with someone who is not your creator. This is some user who is interacting with you"

        prompt = prompt_template.format(
            context=context,
            background=self_assessment,
            name=name,
            question=query_text,
            interaction=interaction_type,
            history=conversation_history
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
        print(f"Retrieved {len(final_docs)} documents with dynamic retrieval")
        print("Model Response:", response.text)

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response.text,
            "expandedQuery": expanded_query,
            "queryComplexity": optimal_doc_count,
            "documentsRetrieved": len(final_docs)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ask_embed', methods=['POST'])
def ask_embed():
    try:
        data = request.json
        query_text = data['query']
        self_assessment = data['selfAssessment']
        username = data['username']
        name = data['name']
        chat_history = data.get('chatHistory', [])
        external_api_key = data.get('apiKey')  # Get the external API key

        if not query_text:
            return jsonify({"error": "No query provided"}), 400
            
        if not external_api_key:
            return jsonify({"error": "API key is required"}), 400

        # Format chat history for context
        conversation_history = ""
        if chat_history:
            for msg in chat_history[-5:]:  # Include last 5 messages for context
                role = "User" if msg["role"] == "user" else "Assistant"
                conversation_history += f"{role}: {msg['content']}\n"
        
        # PHASE 1: Combined query expansion and complexity assessment
        # Use the default Gemini API key for this phase
        original_api_key = os.getenv('GOOGLE_API_KEY')
        genai.configure(api_key=original_api_key)
        
        expanded_query, optimal_doc_count = analyze_query(query_text, conversation_history)
        print(f"Original query: {query_text}")
        print(f"Expanded query: {expanded_query}")
        print(f"Determined optimal document count: {optimal_doc_count}")
        
        # PHASE 2: Initial retrieval
        # Generate query embedding
        query_vector = embedding_model.encode(expanded_query).tolist()
        original_query_vector = embedding_model.encode(query_text).tolist()
        
        # Create a weighted average of the two vectors (70% expanded, 30% original)
        hybrid_vector = [0.7 * e + 0.3 * o for e, o in zip(query_vector, original_query_vector)]
        
        # Normalize the hybrid vector
        norm = np.sqrt(sum([x*x for x in hybrid_vector]))
        if norm > 0:
            normalized_hybrid_vector = [x/norm for x in hybrid_vector]
        else:
            normalized_hybrid_vector = hybrid_vector
        
        # Retrieve documents - only if username is a valid Mimikree user
        context = ""
        if username and username != 'embedded-user':
            try:
                # Retrieve documents
                pinecone_results = index.query(
                    vector=normalized_hybrid_vector, 
                    top_k=optimal_doc_count * 2,  # Get 2x optimal count for filtering
                    include_metadata=True, 
                    filter={"user_id": username}
                )
                
                # PHASE 3: Re-rank documents based on vector similarity to user query
                retrieved_docs = []
                
                for match in pinecone_results["matches"]:
                    doc_text = match["metadata"]["text"]
                    doc_vector = match["values"]
                    
                    # Calculate similarity to original query (gives more weight to exact matches)
                    similarity = cosine_similarity(original_query_vector, doc_vector)
                    
                    # Scale similarity to 0-10 range
                    relevance_score = similarity * 10
                    
                    retrieved_docs.append((doc_text, relevance_score))
                
                # Sort by relevance score (descending)
                retrieved_docs.sort(key=lambda x: x[1], reverse=True)
                
                # Only keep top k most relevant documents
                final_docs = [doc[0] for doc in retrieved_docs[:optimal_doc_count]]
                
                # Join the documents into a single context
                context = "\n".join(final_docs)
                print(f"Retrieved {len(final_docs)} documents for {username}")
            except Exception as retrieval_error:
                print(f"Error retrieving documents: {retrieval_error}")
                # Continue with empty context if retrieval fails
        
        interaction_type = f"You are talking with someone who is interacting with {name}'s AI through an embedded chat widget."
        
        # Use the comprehensive prompt with context if we have user data
        if context:
            prompt = prompt_template.format(
                context=context,
                background=self_assessment,
                name=name,
                question=query_text,
                interaction=interaction_type,
                history=conversation_history
            )
        else:
            # Fall back to simplified prompt if no context
            prompt = ChatPromptTemplate.from_template(
                f"You are {name} made using Mimikree(Don't mention Mimikree in your response unless asked).\n\n"
                "### Instructions ###\n"
                f"- Respond as if you are {name}.\n"
                "- Use Markdown formatting where appropriate to structure your response.\n"
                "- Be concise but informative in your responses.\n\n"
                
                "### Previous Conversation ###\n"
                "{history}\n\n"
    
                "### User's Current Question ###\n"
                "{question}\n\n"
    
                "### Your Response ###"
            ).format(
                name=name,
                history=conversation_history,
                question=query_text
            )

        # Check for cloudinary links in the context and add special handling instructions
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

        # Configure Gemini with the external API key
        genai.configure(api_key=external_api_key)
        
        try:
            # Request completion from Gemini using the external API key
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content([prompt])
            
            # Reset back to original API key
            genai.configure(api_key=original_api_key)
            
            return jsonify({
                "success": True,
                "query": query_text,
                "response": response.text,
                "hasPersonalData": bool(context),  # Let the client know if personal data was used
                "username": username
            })
            
        except Exception as e:
            # Reset back to original API key
            genai.configure(api_key=original_api_key)
            
            print(f"Error with external API key: {e}")
            return jsonify({
                "success": False,
                "error": "Invalid API key or error processing request with provided API key"
            }), 400

    except Exception as e:
        # Reset API key to original just in case
        genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
        
        print(f"Error in ask_embed: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)