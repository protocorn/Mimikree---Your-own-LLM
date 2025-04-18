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

# Query complexity assessment prompt
query_complexity_prompt = PromptTemplate.from_template(
"""Analyze the following query and determine how many relevant documents would be needed to provide a comprehensive answer.
Consider these factors:
1. Query complexity (simple factual queries need fewer documents, complex analytical questions need more)
2. Breadth of topics (narrow topics need fewer documents, broad topics need more)
3. Need for diverse perspectives (single-perspective queries need fewer documents)
4. Temporal aspects (recent events may need fewer but more recent documents)

Query: {query}

Based on this analysis, provide a number between 1 and 15 representing the optimal number of documents to retrieve.
Return ONLY a number without any explanation."""
)

# Document relevance assessment prompt
document_relevance_prompt = PromptTemplate.from_template(
"""You are a document relevance evaluator. Given the query, conversation history, and retrieved document, determine if the document is relevant to answering the query.
Score from 0-10, where:
- 0-3: Not relevant
- 4-6: Somewhat relevant
- 7-10: Highly relevant

Query: {query}
Conversation History: {history}
Document: {document}

Return ONLY a number between 0 and 10 representing the relevance score without any explanation."""
)

# Conversation-aware query expansion prompt
conversation_query_expansion_prompt = PromptTemplate.from_template(
"""Based on the current query and conversation history, generate an expanded query that captures the full context 
of what the user is seeking. The expanded query should incorporate relevant context from the conversation history.

Current Query: {query}
Conversation History:
{history}

Return ONLY the expanded query that best represents what information is needed based on both the current query and 
conversation history. Do not include any explanations or additional text."""
)

# Initialize LLM for complexity and relevance assessment
# Using Gemini for assessments
def get_complexity_assessment(query_text):
    """Assess query complexity and determine optimal number of documents"""
    try:
        prompt = query_complexity_prompt.format(query=query_text)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([prompt])
        # Extract just the number from response
        number_match = re.search(r'\b(\d+)\b', response.text)
        if number_match:
            return min(max(int(number_match.group(1)), 1), 15)  # Ensure between 1-15
        return 3  # Default to 3 if no number found
    except Exception as e:
        print(f"Error in complexity assessment: {e}")
        return 3  # Default to 3 on error

def get_document_relevance(query_text, document_text, conversation_history=""):
    """Assess document relevance to the query and conversation history"""
    try:
        prompt = document_relevance_prompt.format(
            query=query_text, 
            document=document_text,
            history=conversation_history
        )
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([prompt])
        # Extract just the number from response
        number_match = re.search(r'\b(\d+)\b', response.text)
        if number_match:
            return min(max(int(number_match.group(1)), 0), 10)  # Ensure between 0-10
        return 5  # Default to middle relevance if no number found
    except Exception as e:
        print(f"Error in relevance assessment: {e}")
        return 5  # Default to middle relevance on error

def expand_query_with_conversation(query_text, conversation_history=""):
    """Expand the query using conversation history for better context retrieval"""
    if not conversation_history.strip():
        return query_text  # If no conversation history, return original query
    
    try:
        prompt = conversation_query_expansion_prompt.format(
            query=query_text,
            history=conversation_history
        )
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content([prompt])
        expanded_query = response.text.strip()
        return expanded_query if expanded_query else query_text
    except Exception as e:
        print(f"Error in query expansion: {e}")
        return query_text  # Return original query on error

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
        
        # PHASE 0: Expand query with conversation context
        expanded_query = expand_query_with_conversation(query_text, conversation_history)
        print(f"Original query: {query_text}")
        print(f"Expanded query: {expanded_query}")
        
        # PHASE 1: Assess query complexity and determine optimal document count
        optimal_doc_count = get_complexity_assessment(expanded_query)
        print(f"Determined optimal document count: {optimal_doc_count} for expanded query")
        
        # PHASE 2: Initial retrieval with higher k than needed
        # Generate query embedding using expanded query for better context
        query_vector = embedding_model.encode(expanded_query).tolist()
        
        # Create a hybrid query: combine original query with expanded one
        original_query_vector = embedding_model.encode(query_text).tolist()
        
        # Create a weighted average of the two vectors (70% expanded, 30% original)
        hybrid_vector = [0.7 * e + 0.3 * o for e, o in zip(query_vector, original_query_vector)]
        
        # Normalize the hybrid vector
        norm = np.sqrt(sum([x*x for x in hybrid_vector]))
        if norm > 0:
            normalized_hybrid_vector = [x/norm for x in hybrid_vector]
        else:
            normalized_hybrid_vector = hybrid_vector
        
        # Retrieve more documents than we need for filtering
        initial_k = min(optimal_doc_count * 2, 25)  # Get 2x optimal count, maximum 25
        pinecone_results = index.query(
            vector=normalized_hybrid_vector, 
            top_k=initial_k, 
            include_metadata=True, 
            filter={"user_id": username}
        )
        
        # PHASE 3: Re-rank documents based on relevance with conversation history
        retrieved_docs = []
        relevance_scores = []
        
        for match in pinecone_results["matches"]:
            doc_text = match["metadata"]["text"]
            # Pass conversation history to relevance assessment
            relevance = get_document_relevance(query_text, doc_text, conversation_history)
            retrieved_docs.append((doc_text, relevance))
            relevance_scores.append(relevance)
        
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
            "response": response.text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)