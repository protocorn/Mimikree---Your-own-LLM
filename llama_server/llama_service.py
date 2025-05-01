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
from utils.gemini_key_manager import with_key_rotation  # Import our key rotation decorator
import datetime

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
# We no longer need to explicitly configure here as the key manager handles this
# genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

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
    "- Pay special attention to information marked with [MEMORY] tags - these are your personal memories.\n"
    "- Always incorporate relevant memories into your responses to personalize them.\n"
    "- If a memory contradicts older information, prioritize the most recent memory.\n"
    "- IMPORTANT PRIVACY RULE: NEVER share information from [PRIVATE MEMORY] entries. When asked about private information by anyone other than yourself, politely deflect or say you prefer not to share that information.\n"
    "- NEVER reveal sensitive personal information such as:\n"
    "  * Identification numbers (IDs, SSN, account numbers)\n"
    "  * Contact information (phone numbers, addresses)\n"
    "  * Credentials (passwords, PINs)\n"
    "  * Financial details\n"
    "  * Medical information\n"
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
@with_key_rotation
def analyze_query(query_text, conversation_history=""):
    """Expand query using conversation history and assess optimal document count in a single call"""
    try:
        prompt = query_analysis_prompt.format(
            query=query_text,
            history=conversation_history
        )
        model = genai.GenerativeModel("gemini-2.0-flash")
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

@app.route('/delete_user_data', methods=['POST'])
def delete_user_data():
    """Deletes all user data from Pinecone matching the specified criteria."""
    try:
        data = request.json
        user_id = data.get("username", "")
        data_source = data.get("source", "")  # e.g., "github", "linkedin", etc.
        pdf_filename = data.get("pdfFilename", "")  # For PDF deletion

        if not user_id:
            return jsonify({"error": "Username is required"}), 400

        # Query vectors that belong to the user
        query_response = index.query(
            vector=[0] * 768,  # Dummy vector for metadata-only filtering
            top_k=10000,  # High number to get all matches
            include_metadata=True,
            filter={"user_id": user_id}
        )

        # Extract vectors that match the source type
        vectors_to_delete = []
        
        for match in query_response["matches"]:
            vector_id = match["id"]
            text = match["metadata"]["text"]
            
            # Handle different source types
            if data_source == "pdf" and pdf_filename:
                # Check if the text contains the specific PDF filename
                if f"PDF Name: {pdf_filename}" in text:
                    vectors_to_delete.append(vector_id)
            elif data_source:
                # For other sources, check if text contains the source type
                if data_source.lower() in text.lower():
                    vectors_to_delete.append(vector_id)
            else:
                # If no source specified, delete all user data
                vectors_to_delete.append(vector_id)
        
        # Delete the vectors if any found
        if vectors_to_delete:
            # Delete vectors in batches of 100 to avoid exceeding API limits
            batch_size = 100
            for i in range(0, len(vectors_to_delete), batch_size):
                batch = vectors_to_delete[i:i+batch_size]
                delete_response = index.delete(ids=batch)
            
            return jsonify({
                "success": True, 
                "message": f"Deleted {len(vectors_to_delete)} documents for user {user_id}",
                "deleted_count": len(vectors_to_delete)
            })
        else:
            return jsonify({
                "success": True, 
                "message": f"No matching documents found for user {user_id}",
                "deleted_count": 0
            })

    except Exception as e:
        print(f"Error in delete_user_data: {e}")  # Add logging for debugging
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask():
    """Handles user queries, retrieves context, and generates responses."""
    try:
        data = request.json
        query = data.get("query", "")
        user_id = data.get("username", "")
        name = data.get("name", "User")
        self_assessment = data.get("selfAssessment", "")
        memory_enabled = data.get("memory_enabled", True)
        conversation_history = data.get("chatHistory", "")
        
        # Define is_own_model based on memory_enabled
        is_own_model = memory_enabled
        
        
        if not query:
            return jsonify({"error": "No query provided"}), 400

        # Format chat history for context
        if conversation_history:
            if isinstance(conversation_history, list):
                formatted_history = ""
                for message in conversation_history[-3:]:  # Include last 3 messages
                    role = message.get("role", "unknown")
                    content = message.get("content", "")
                    if role == "user":
                        formatted_history += f"User: {content}\n"
                    elif role == "assistant":
                        formatted_history += f"Assistant: {content}\n"
                    elif role == "system":
                        formatted_history += f"System: {content}\n"
                conversation_history = formatted_history
        
        # PHASE 1: Combined query expansion and complexity assessment
        expanded_query, optimal_doc_count = analyze_query(query, conversation_history)
        print(f"Original query: {query}")
        print(f"Expanded query: {expanded_query}")
        print(f"Determined optimal document count: {optimal_doc_count}")
        
        # PHASE 2: Initial retrieval
        # Generate query embedding
        query_vector = embedding_model.encode(expanded_query).tolist()
        original_query_vector = embedding_model.encode(query).tolist()
        
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
        if user_id and user_id != 'embedded-user':
            try:
                # Get regular user documents
                pinecone_results = index.query(
                    vector=normalized_hybrid_vector, 
                    top_k=optimal_doc_count * 2,  # Get 2x optimal count for filtering
                    include_metadata=True, 
                    filter={"user_id": user_id}
                )
                
                # Use enhanced memory retrieval
                memory_matches = retrieve_relevant_memories(
                    query_text=query,
                    query_vector=normalized_hybrid_vector,
                    user_id=user_id,
                    optimal_doc_count=optimal_doc_count
                )
                
                # Combine regular documents with prioritized memories
                # Create a unified format for both types
                all_matches = []
                
                # Add regular document matches
                for match in pinecone_results["matches"]:
                    # Skip memory type documents - we'll get them from memory retrieval
                    if match["metadata"].get("type") == "memory":
                        continue
                        
                    all_matches.append({
                        "id": match["id"],
                        "score": match["score"],
                        "values": match["values"],
                        "metadata": match["metadata"],
                        "source": "document",
                        "final_score": match["score"]  # Set base score for documents
                    })
                
                # Add memory matches
                all_matches.extend(memory_matches)
                
                # PHASE 3: Re-rank all documents based on combined factors
                # Sort by final_score (memories already have this calculated)
                all_matches.sort(key=lambda x: x.get("final_score", 0), reverse=True)
                
                # Prepare for retrieval
                retrieved_docs = []
                
                for match in all_matches:
                    doc_text = match["metadata"]["text"]
                    
                    # Format memory items specially
                    if match["metadata"].get("type") == "memory":
                        memory_summary = match["metadata"].get("summary", "")
                        memory_category = match["metadata"].get("category", "general")
                        privacy_level = match["metadata"].get("privacy_level", 0)
                        
                        # Mark private memories
                        if privacy_level > 0 and not is_own_model:
                            doc_text = f"[PRIVATE MEMORY - {memory_category}] {memory_summary}: This memory contains private information that should not be shared with anyone except the user themselves."
                        else:
                            doc_text = f"[MEMORY - {memory_category}] {memory_summary}: {doc_text}"
                    
                    # Use final score as relevance
                    relevance_score = match.get("final_score", match.get("score", 0)) * 10
                    
                    retrieved_docs.append((doc_text, relevance_score))
                
                # Only keep top k most relevant documents
                final_docs = [doc[0] for doc in retrieved_docs[:optimal_doc_count]]
                
                # Join the documents into a single context
                context = "\n".join(final_docs)
                print(f"Retrieved {len(final_docs)} documents for {user_id}")
            except Exception as retrieval_error:
                print(f"Error retrieving documents: {retrieval_error}")
                # Continue with empty context if retrieval fails
        
        if memory_enabled:
            interaction_type = (f"You are talking with your creator/owner. Respond in a more personal, familiar way since this is {name} who created you."
                              f"Note: When {name} says 'my' or 'mine', they are referring to their own things. "
                              )
        else:
            interaction_type = f"You are talking with someone who is not your creator. This is some user who is interacting with you"

        prompt = prompt_template.format(
            context=context,
            background=self_assessment,
            name=name,
            question=query,
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

        # Request completion from Gemini - wrapped with key rotation
        @with_key_rotation
        def generate_gemini_response(prompt, user_id, conversation_history=""):
            try:
                model = genai.GenerativeModel("gemini-2.0-flash")
                
                print(f"[MEMORY MODULE] Analyzing response for user {user_id} using single API call")
                
                # Create a prompt that requests both the response and memory analysis in JSON format
                json_prompt = f"""
                {prompt}
                
                IMPORTANT: Return your entire response in valid JSON format with the following structure:
                {{
                    "response": "your actual response to the user goes here in markdown format",
                    "memory_analysis": {{
                        "IS_VITAL": boolean (true if user shared important personal information),
                        "PRESENT_IN_CONTEXT": number between 0-100 (how much of this information is already in the context),
                        "MEMORY_SUMMARY": "brief description of what should be remembered" (empty if nothing vital),
                        "EXTRACTED_INFO": "exact information to store as a string" (empty if nothing vital),
                        "MEMORY_CATEGORY": "one of: contact, preference, personal, work, education, health, technical, general",
                        "IMPORTANCE_SCORE": number between 1-10 (how important this information is to remember)
                    }}
                }}
                
                IMPORTANT: Make sure EXTRACTED_INFO is always a string, not an object or nested JSON.
                Only include memory_analysis if vital information was detected.
                """
                
                # Make a single call to get both response and memory analysis
                json_response = model.generate_content([json_prompt])
                full_text = json_response.text.strip()
                
                # Parse the JSON response
                try:
                    import json
                    import re
                    
                    # Find JSON in the response
                    json_match = re.search(r'({.*})', full_text, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(1)
                        parsed_data = json.loads(json_str)
                        
                        # Extract regular response
                        regular_response = parsed_data.get("response", "")
                        
                        # Extract memory data if available
                        memory_data = parsed_data.get("memory_analysis")
                        
                        if memory_data and memory_data.get("IS_VITAL", False):
                            print(f"[MEMORY MODULE] Detected vital information: {memory_data.get('MEMORY_SUMMARY', 'Unknown')}")
                            print(f"[MEMORY MODULE] Context match: {memory_data.get('PRESENT_IN_CONTEXT', 0)}%")
                        else:
                            print(f"[MEMORY MODULE] No vital information detected in response")
                    else:
                        # If no JSON found, use the whole response as regular response
                        print(f"[MEMORY MODULE ERROR] No JSON format detected in response")
                        regular_response = full_text
                        memory_data = None
                        
                except Exception as e:
                    print(f"[MEMORY MODULE ERROR] Error parsing JSON response: {e}")
                    regular_response = "I apologize, but there was an error processing your request."
                    memory_data = None
                    
                # Return both the regular response and memory data
                return {
                    "response": regular_response,
                    "memory_data": memory_data
                }
            except Exception as e:
                print(f"[MEMORY MODULE ERROR] Error generating content: {e}")
                return {
                    "response": "I apologize, but I'm having trouble processing your request. Please try again.",
                    "memory_data": None
                }
        
        # Call the wrapped function
        response_data = generate_gemini_response(prompt, user_id, conversation_history)
        
        # Log the response for debugging
        print(f"Retrieved {len(final_docs)} documents with dynamic retrieval")
        print("Model Response:", response_data["response"])

        response_text = response_data["response"]
        memory_data = response_data["memory_data"]
        
        # Check if memory data needs to be stored
        memory_confirmation_needed = False
        if memory_enabled and memory_data and memory_data.get("IS_VITAL", False):
            present_in_context = memory_data.get("PRESENT_IN_CONTEXT", 100)
            if present_in_context < 50:  # Threshold for new information
                memory_confirmation_needed = True
                print(f"[MEMORY MODULE] Memory confirmation needed for user {user_id}")
                print(f"[MEMORY MODULE] Information: {memory_data.get('MEMORY_SUMMARY', 'Unknown')}")
            else:
                print(f"[MEMORY MODULE] Information already in context ({present_in_context}%), no confirmation needed")
        elif memory_enabled:
            if not memory_data:
                print(f"[MEMORY MODULE] No vital information detected for user {user_id}")
            elif not memory_data.get("IS_VITAL", False):
                print(f"[MEMORY MODULE] Information not vital enough to store for user {user_id}")
        else:
            print(f"[MEMORY MODULE] Memory module disabled for this request")
        
        # Return response with memory data if confirmation needed
        return jsonify({
            "success": True,
            "query": query,
            "response": response_text,
            "expandedQuery": expanded_query,
            "queryComplexity": optimal_doc_count,
            "documentsRetrieved": len(final_docs),
            "memory_confirmation_needed": memory_confirmation_needed,
            "memory_data": memory_data if memory_confirmation_needed else None
        })

    except Exception as e:
        print(f"Error processing query: {e}")
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

        # Define is_own_model as false for embedded model access
        is_own_model = False

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
        # We'll still use our key rotation for this phase
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
                # Get regular user documents
                pinecone_results = index.query(
                    vector=normalized_hybrid_vector, 
                    top_k=optimal_doc_count * 2,  # Get 2x optimal count for filtering
                    include_metadata=True, 
                    filter={"user_id": username}
                )
                
                # Use enhanced memory retrieval
                memory_matches = retrieve_relevant_memories(
                    query_text=query_text,
                    query_vector=normalized_hybrid_vector,
                    user_id=username,
                    optimal_doc_count=optimal_doc_count
                )
                
                # Combine regular documents with prioritized memories
                # Create a unified format for both types
                all_matches = []
                
                # Add regular document matches
                for match in pinecone_results["matches"]:
                    # Skip memory type documents - we'll get them from memory retrieval
                    if match["metadata"].get("type") == "memory":
                        continue
                        
                    all_matches.append({
                        "id": match["id"],
                        "score": match["score"],
                        "values": match["values"],
                        "metadata": match["metadata"],
                        "source": "document",
                        "final_score": match["score"]  # Set base score for documents
                    })
                
                # Add memory matches
                all_matches.extend(memory_matches)
                
                # PHASE 3: Re-rank all documents based on combined factors
                # Sort by final_score (memories already have this calculated)
                all_matches.sort(key=lambda x: x.get("final_score", 0), reverse=True)
                
                # Prepare for retrieval
                retrieved_docs = []
                
                for match in all_matches:
                    doc_text = match["metadata"]["text"]
                    
                    # Format memory items specially
                    if match["metadata"].get("type") == "memory":
                        memory_summary = match["metadata"].get("summary", "")
                        memory_category = match["metadata"].get("category", "general")
                        privacy_level = match["metadata"].get("privacy_level", 0)
                        
                        # Mark private memories
                        if privacy_level > 0 and not is_own_model:
                            doc_text = f"[PRIVATE MEMORY - {memory_category}] {memory_summary}: This memory contains private information that should not be shared with anyone except the user themselves."
                        else:
                            doc_text = f"[MEMORY - {memory_category}] {memory_summary}: {doc_text}"
                    
                    # Use final score as relevance
                    relevance_score = match.get("final_score", match.get("score", 0)) * 10
                    
                    retrieved_docs.append((doc_text, relevance_score))
                
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
            
            # Reset back to our key manager's current key
            from utils.gemini_key_manager import key_manager
            genai.configure(api_key=key_manager.current_key)
            
            return jsonify({
                "success": True,
                "query": query_text,
                "response": response.text,
                "hasPersonalData": bool(context),  # Let the client know if personal data was used
                "username": username
            })
            
        except Exception as e:
            # Reset back to our key manager's current key
            from utils.gemini_key_manager import key_manager
            genai.configure(api_key=key_manager.current_key)
            
            print(f"Error with external API key: {e}")
            return jsonify({
                "success": False,
                "error": "Invalid API key or error processing request with provided API key"
            }), 400

    except Exception as e:
        # Reset API key to our key manager's current key
        from utils.gemini_key_manager import key_manager
        genai.configure(api_key=key_manager.current_key)
        
        print(f"Error in ask_embed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/store_memory', methods=['POST'])
def store_memory():
    """Stores confirmed memory in Pinecone."""
    try:
        data = request.json
        memory_text = data.get("memory_text", "")
        user_id = data.get("username", "")
        memory_summary = data.get("memory_summary", "")
        
        # Get optional category and tags if provided
        memory_category = data.get("memory_category", "general")
        memory_tags = data.get("memory_tags", [])
        privacy_level = data.get("privacy_level", 0)  # Default to public
        
        # Auto-categorize if not provided
        if memory_category == "general" and not memory_tags:
            memory_category, memory_tags, privacy_level = auto_categorize_memory(memory_text, memory_summary)

        if not memory_text or not user_id:
            return jsonify({"error": "Memory text and username are required"}), 400
            
        # Handle case where memory_text is an object instead of string
        if isinstance(memory_text, dict):
            print(f"[MEMORY STORAGE] Converting memory_text from object to string")
            # Convert the object to a formatted string
            memory_text_str = ""
            for key, value in memory_text.items():
                memory_text_str += f"{key}: {value}\n"
            memory_text = memory_text_str.strip()
            
        print(f"[MEMORY STORAGE] Storing new memory for user {user_id}: {memory_summary}")
        print(f"[MEMORY STORAGE] Memory text: {memory_text}")
        print(f"[MEMORY STORAGE] Category: {memory_category}, Tags: {memory_tags}, Privacy: {privacy_level}")
        
        # Generate embedding for the memory
        vector = embedding_model.encode(memory_text).tolist()

        # Generate a unique memory ID
        memory_id = f"memory_{user_id}_{str(uuid.uuid4())}"
        
        # Add importance score (default to 5 out of 10)
        importance_score = data.get("importance_score", 5)

        # Store in Pinecone with metadata
        index.upsert(vectors=[(
            memory_id, 
            vector, 
            {
                "text": memory_text, 
                "user_id": user_id,
                "type": "memory",
                "summary": memory_summary,
                "category": memory_category,
                "tags": memory_tags,
                "importance": importance_score,
                "timestamp": str(datetime.datetime.now()),
                "privacy_level": privacy_level
            }
        )])

        print(f"[MEMORY STORAGE] Memory stored successfully with ID: {memory_id}")

        return jsonify({"success": True, "message": "Memory stored successfully"})

    except Exception as e:
        print(f"[MEMORY STORAGE ERROR] Failed to store memory: {str(e)}")
        return jsonify({"error": str(e)}), 500

def auto_categorize_memory(memory_text, memory_summary):
    """Automatically categorize memory based on content."""
    # Simple rule-based categorization
    memory_lower = memory_text.lower() + " " + memory_summary.lower()
    
    # Define categories with privacy levels
    # 0 = public, 1 = private (only share with owner)
    categories = {
        "contact": {
            "keywords": ["email", "phone", "address", "contact", "number", "uid", "id", "ssn", "social security"],
            "privacy_level": 1  # Private
        },
        "preference": {
            "keywords": ["prefer", "like", "dislike", "favorite", "hate"],
            "privacy_level": 0  # Public
        },
        "personal": {
            "keywords": ["birthday", "age", "name", "family", "spouse", "child", "parent", "address"],
            "privacy_level": 1  # Private
        },
        "credentials": {
            "keywords": ["password", "username", "login", "credential", "token", "key", "secret", "pin"],
            "privacy_level": 1  # Private
        },
        "financial": {
            "keywords": ["bank", "credit", "card", "account", "money", "finance", "salary", "income", "payment"],
            "privacy_level": 1  # Private
        },
        "work": {
            "keywords": ["job", "work", "career", "company", "position", "role", "business"],
            "privacy_level": 0  # Public
        },
        "education": {
            "keywords": ["university", "college", "school", "degree", "major", "study", "class", "student", "grade"],
            "privacy_level": 1  # Private - universities often contain ID numbers, etc.
        },
        "health": {
            "keywords": ["allergy", "medication", "condition", "doctor", "health", "medical", "prescription"],
            "privacy_level": 1  # Private
        },
        "technical": {
            "keywords": ["software", "hardware", "version", "upgrade", "api", "code", "app", "application", "website"],
            "privacy_level": 0  # Public
        },
    }
    
    # Determine category
    detected_category = "general"
    detected_tags = []
    privacy_level = 0  # Default to public
    
    for category, data in categories.items():
        keywords = data["keywords"]
        for keyword in keywords:
            if keyword in memory_lower:
                detected_category = category
                if keyword not in detected_tags:
                    detected_tags.append(keyword)
                privacy_level = max(privacy_level, data["privacy_level"])  # Use highest privacy level found
    
    # Special case: detect IDs and numbers specifically as private
    id_patterns = [
        r"\b\d{5,}\b",  # 5+ digit numbers
        r"\b[A-Z]{2,}\d{3,}\b",  # 2+ letters followed by 3+ digits
        r"\b\d{3,}-\d{2,}-\d{2,}\b",  # Social security pattern
        r"\b[A-Z]\d{7,}\b",  # ID pattern like A1234567
    ]
    
    for pattern in id_patterns:
        if re.search(pattern, memory_text):
            privacy_level = 1  # Mark as private
            if "id" not in detected_tags:
                detected_tags.append("id")
            
    return detected_category, detected_tags, privacy_level

def retrieve_relevant_memories(query_text, query_vector, user_id, optimal_doc_count=3):
    """Enhanced memory retrieval using a multi-stage approach."""
    print(f"[MEMORY RETRIEVAL] Starting enhanced memory retrieval for user {user_id}")
    
    # Step 1: Extract key entities and concepts from the query
    query_lower = query_text.lower()
    query_categories = []
    
    # Check which categories might be relevant to this query
    categories = {
        "contact": ["email", "phone", "address", "contact", "number", "uid"],
        "preference": ["prefer", "like", "dislike", "favorite", "hate"],
        "personal": ["birthday", "age", "name", "family", "spouse", "child"],
        "work": ["job", "work", "career", "company", "position", "role", "business"],
        "education": ["university", "college", "school", "degree", "major", "study", "class"],
        "health": ["allergy", "medication", "condition", "doctor", "health"],
        "technical": ["software", "hardware", "version", "upgrade", "api", "code", "app", "application"],
    }
    
    for category, keywords in categories.items():
        for keyword in keywords:
            if keyword in query_lower:
                if category not in query_categories:
                    query_categories.append(category)
                    print(f"[MEMORY RETRIEVAL] Query matches category: {category}")
    
    # If no specific categories matched, we'll search everything
    if not query_categories:
        query_categories = ["general"]
        print(f"[MEMORY RETRIEVAL] No specific category matched, using general search")
    
    # Step 2: Get memories by vector similarity
    semantic_memories = []
    
    # First try to get category-specific memories
    for category in query_categories:
        if category != "general":
            try:
                category_filter = {
                    "user_id": user_id, 
                    "type": "memory",
                    "category": category
                }
                
                category_results = index.query(
                    vector=query_vector,
                    top_k=optimal_doc_count,
                    include_metadata=True,
                    filter=category_filter
                )
                
                # Add category-specific results to our collection
                for match in category_results.get("matches", []):
                    # Add source to track where this came from
                    match["source"] = f"category:{category}"
                    semantic_memories.append(match)
                    
                print(f"[MEMORY RETRIEVAL] Found {len(category_results.get('matches', []))} memories in category {category}")
            except Exception as e:
                print(f"[MEMORY RETRIEVAL] Error querying category {category}: {e}")
    
    # Then get general memories (not category-specific)
    try:
        # Basic filter for user's memories
        base_filter = {
            "user_id": user_id, 
            "type": "memory"
        }
        
        # Get memories by semantic similarity
        general_results = index.query(
            vector=query_vector,
            top_k=optimal_doc_count * 2,  # Get more, then we'll filter
            include_metadata=True,
            filter=base_filter
        )
        
        for match in general_results.get("matches", []):
            # Check if we already have this memory from a category search
            if not any(m["id"] == match["id"] for m in semantic_memories):
                match["source"] = "general"
                semantic_memories.append(match)
                
        print(f"[MEMORY RETRIEVAL] Found {len(general_results.get('matches', []))} general memories")
    except Exception as e:
        print(f"[MEMORY RETRIEVAL] Error retrieving general memories: {e}")
    
    # Step 3: Add any critical high-importance memories regardless of query relevance
    try:
        important_filter = {
            "user_id": user_id, 
            "type": "memory",
            "importance": {"$gte": 8}  # Only very important memories
        }
        
        important_results = index.query(
            vector=[0] * 768,  # Dummy vector, we'll filter by metadata
            top_k=5,
            include_metadata=True,
            filter=important_filter
        )
        
        for match in important_results.get("matches", []):
            # Check if we already have this memory
            if not any(m["id"] == match["id"] for m in semantic_memories):
                match["source"] = "important"
                semantic_memories.append(match)
                
        print(f"[MEMORY RETRIEVAL] Found {len(important_results.get('matches', []))} important memories")
    except Exception as e:
        print(f"[MEMORY RETRIEVAL] Error retrieving important memories: {e}")
    
    # Step 4: Rank and filter results
    # Calculate a comprehensive score based on semantic similarity, importance, and recency
    for memory in semantic_memories:
        # Base score is the semantic similarity
        base_score = memory.get("score", 0) 
        
        # Importance modifier (0.1 to 0.5 boost)
        importance = memory["metadata"].get("importance", 5)
        importance_modifier = importance / 20  # Scale from 0-10 to 0-0.5
        
        # Recency modifier - boost newer memories
        timestamp_str = memory["metadata"].get("timestamp")
        recency_modifier = 0
        if timestamp_str:
            try:
                # Parse timestamp
                timestamp = datetime.datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                # Calculate days since creation
                days_old = (datetime.datetime.now() - timestamp).days
                # Newer memories get a boost (max 0.3)
                recency_modifier = max(0, 0.3 - (days_old / 100 * 0.3))
            except Exception as e:
                print(f"[MEMORY RETRIEVAL] Error calculating recency: {e}")
        
        # Calculate final score
        memory["final_score"] = base_score + importance_modifier + recency_modifier
        
    # Sort by final score
    semantic_memories.sort(key=lambda x: x.get("final_score", 0), reverse=True)
    
    # Limit to optimal number of documents
    final_memories = semantic_memories[:optimal_doc_count]
    
    # Log retrieved memories
    if final_memories:
        print(f"[MEMORY RETRIEVAL] Final memories selected: {len(final_memories)}")
        for i, memory in enumerate(final_memories):
            summary = memory["metadata"].get("summary", "No summary")
            category = memory["metadata"].get("category", "No category")
            importance = memory["metadata"].get("importance", "?")
            score = memory.get("final_score", 0)
            print(f"[MEMORY RETRIEVAL] Memory {i+1}: {summary} (Category: {category}, Importance: {importance}, Final Score: {score:.4f})")
    else:
        print(f"[MEMORY RETRIEVAL] No relevant memories found for user {user_id}")
    
    return final_memories

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)