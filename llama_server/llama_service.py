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
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from collections import Counter
import string

# Download necessary NLTK resources
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('punkt')
    nltk.download('stopwords')

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

# Initialize Gemini API
genai.configure(api_key="AIzaSyAcPmStNQlnzgYg_nWlrsOVxHfARIdMOIA")

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

def analyze_query_complexity(query):
    """
    Analyze the complexity of a query using NLP techniques.
    Returns a complexity score and a dictionary with analysis details.
    """
    # Initialize stopwords
    stop_words = set(stopwords.words('english'))
    
    # Tokenize the query and convert to lowercase
    tokens = word_tokenize(query.lower())
    
    # Remove punctuation and stopwords
    tokens = [token for token in tokens if token not in string.punctuation and token not in stop_words]
    
    # Calculate features for complexity scoring
    num_tokens = len(tokens)
    unique_tokens = len(set(tokens))
    token_diversity = unique_tokens / max(num_tokens, 1)  # Higher diversity = more complex
    
    # Identify question types based on starting words
    question_starters = {
        'what': 3,   # Basic information
        'who': 3,    # Person-focused
        'where': 3,  # Location-focused
        'when': 3,   # Time-focused
        'why': 7,    # Explanation/reasoning (more complex)
        'how': 8,    # Process/method (most complex)
        'which': 5,  # Selection between options
        'list': 9,   # List requests (need more data)
        'describe': 7, # Detailed description
        'explain': 8,  # Detailed explanation
        'compare': 9,  # Comparison (very complex)
        'analyze': 9,  # Analysis (very complex)
        'all': 9,      # Comprehensive (very complex)
        'every': 9,    # Comprehensive (very complex)
        'best': 7,     # Evaluative (complex)
        'top': 7,      # Evaluative (complex)
        'most': 6,     # Evaluative
        'favorite': 5, # Preference
    }
    
    # Check for question starters
    question_complexity = 0
    for starter, value in question_starters.items():
        if starter in tokens:
            question_complexity = max(question_complexity, value)
    
    # Special keywords that indicate complexity
    complexity_keywords = {
        'difference': 7,
        'similarities': 7,
        'versus': 8,
        'vs': 8,
        'comparison': 8,
        'detail': 6,
        'specific': 6,
        'elaborate': 7,
        'projects': 7,
        'achievements': 7,
        'skills': 6,
        'experience': 6,
        'background': 5,
        'history': 6,
        'portfolio': 7,
        'technical': 6
    }
    
    # Check for complexity keywords
    keyword_complexity = 0
    for keyword, value in complexity_keywords.items():
        if keyword in tokens:
            keyword_complexity = max(keyword_complexity, value)
    
    # Base complexity score based on query length
    length_score = min(10, num_tokens / 2)  # Cap at 10
    
    # Calculate overall complexity score (weighted average)
    weights = {
        'length': 0.3,
        'question_type': 0.4,
        'keywords': 0.3
    }
    
    complexity_score = (
        weights['length'] * length_score +
        weights['question_type'] * question_complexity +
        weights['keywords'] * keyword_complexity
    )
    
    # Ensure score is within 1-10 range
    complexity_score = max(1, min(10, complexity_score))
    
    # Return the score and analysis details
    return {
        'complexity_score': complexity_score,
        'analysis': {
            'num_tokens': num_tokens,
            'unique_tokens': unique_tokens,
            'token_diversity': token_diversity,
            'question_complexity': question_complexity,
            'keyword_complexity': keyword_complexity,
            'length_score': length_score
        }
    }

def adaptive_top_k(complexity_score):
    """
    Maps a complexity score (1-10) to an appropriate top_k value.
    Higher complexity = higher top_k
    """
    # Adaptive mapping based on complexity score
    if complexity_score < 3:
        return 3  # Simple queries
    elif complexity_score < 5:
        return 5  # Moderately simple queries
    elif complexity_score < 7:
        return 10  # Moderately complex queries
    elif complexity_score < 9:
        return 20  # Complex queries
    else:
        return 30  # Very complex queries

def determine_query_strategy(query_text):
    """
    Analyze query complexity and determine appropriate retrieval strategy.
    """
    # Analyze query complexity
    complexity_analysis = analyze_query_complexity(query_text)
    complexity_score = complexity_analysis['complexity_score']
    
    # Determine appropriate top_k based on complexity
    top_k = adaptive_top_k(complexity_score)
    
    # Determine similarity threshold - inversely related to complexity
    # More complex queries need lower thresholds to capture more context
    if complexity_score >= 8:
        threshold = 0.15  # Very low threshold for highly complex queries
        strategy = "comprehensive"
    elif complexity_score >= 6:
        threshold = 0.18  # Low threshold for complex queries
        strategy = "detailed"
    elif complexity_score >= 4:
        threshold = 0.20  # Medium threshold for moderate queries
        strategy = "balanced"
    else:
        threshold = 0.25  # Higher threshold for simple queries
        strategy = "focused"
    
    return {
        "top_k": top_k,
        "threshold": threshold,
        "strategy": strategy,
        "complexity_score": complexity_score,
        "analysis": complexity_analysis['analysis']
    }

def create_contextual_query(current_query, chat_history, max_history=3):
    """
    Create a contextual query that incorporates relevant conversation history.
    This helps maintain context across multiple turns of conversation.
    """
    if not chat_history or len(chat_history) == 0:
        return current_query
    
    # Extract the most recent exchanges (up to max_history)
    recent_exchanges = chat_history[-min(max_history*2, len(chat_history)):]
    
    # Create a contextual query with weighted components
    contextual_query = current_query
    
    # Add recent exchanges with decreasing weights
    history_context = ""
    for i in range(len(recent_exchanges)-1, -1, -2):
        if i > 0:  # Ensure we have a user-assistant pair
            user_msg = recent_exchanges[i-1]["content"] if recent_exchanges[i-1]["role"] == "user" else ""
            assistant_msg = recent_exchanges[i]["content"] if recent_exchanges[i]["role"] == "assistant" else ""
            
            if user_msg and assistant_msg:
                history_context += f" Previously asked: {user_msg}"
    
    # Combine current query with historical context
    if history_context:
        contextual_query = f"{current_query} (Context from conversation: {history_context})"
        print(f"Enhanced query with conversation context: {contextual_query[:100]}...")
    
    return contextual_query

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

        # Create a contextual query that incorporates conversation history
        contextual_query = create_contextual_query(query_text, chat_history)
        
        # Analyze query complexity and determine retrieval strategy
        query_strategy = determine_query_strategy(contextual_query)
        top_k = query_strategy["top_k"]
        similarity_threshold = query_strategy["threshold"]
        strategy = query_strategy["strategy"]
        complexity_score = query_strategy["complexity_score"]
        
        # Log query analysis
        print(f"Original query: '{query_text}'")
        print(f"Contextual query: '{contextual_query}'")
        print(f"Complexity score: {complexity_score:.2f}, Strategy: {strategy}")
        print(f"Analysis details: {query_strategy['analysis']}")
        print(f"Using top_k: {top_k}, threshold: {similarity_threshold}")
        
        # Generate query embedding from the contextual query
        query_vector = embedding_model.encode(contextual_query).tolist()

        # Retrieve documents using adaptive top_k
        pinecone_results = index.query(
            vector=query_vector, 
            top_k=max(50, top_k),  # Ensure we get enough candidates for filtering
            include_metadata=True, 
            filter={"user_id": username}
        )
        
        # Filter documents based on similarity score
        filtered_results = []
        for match in pinecone_results["matches"]:
            if match["score"] >= similarity_threshold:
                filtered_results.append({
                    "text": match["metadata"]["text"],
                    "score": match["score"]
                })
        
        # Enforce minimum documents based on complexity
        min_docs = max(2, int(complexity_score / 2))  # At least 2, scales with complexity
        
        if len(filtered_results) < min_docs and pinecone_results["matches"]:
            # If we have fewer docs than min_docs, take at least min_docs highest scoring ones
            sorted_results = sorted(pinecone_results["matches"], key=lambda x: x["score"], reverse=True)
            filtered_results = [{"text": match["metadata"]["text"], "score": match["score"]} 
                              for match in sorted_results[:min_docs]]
        
        # Check for conversation continuity - attempt to preserve some context from previous exchanges
        if chat_history and len(chat_history) >= 2:
            # Get the most recent assistant response
            recent_response = None
            for msg in reversed(chat_history):
                if msg["role"] == "assistant":
                    recent_response = msg["content"]
                    break
            
            if recent_response:
                # Look for references to specific entities/topics in the recent response
                # This is a simple approach - in a production system you might use entity extraction
                # or more sophisticated NLP techniques
                important_terms = extract_important_terms(recent_response)
                
                # Check if current query is a follow-up question
                is_followup = is_followup_question(query_text)
                
                if is_followup and important_terms:
                    print(f"Detected follow-up question with important terms: {important_terms}")
                    
                    # Get additional documents related to these terms
                    for term in important_terms[:3]:  # Limit to top 3 terms
                        term_vector = embedding_model.encode(term).tolist()
                        term_results = index.query(
                            vector=term_vector,
                            top_k=3,
                            include_metadata=True,
                            filter={"user_id": username}
                        )
                        
                        # Add these documents to our results if they're above threshold
                        for match in term_results["matches"]:
                            if match["score"] >= similarity_threshold * 0.9:  # Slightly lower threshold
                                filtered_results.append({
                                    "text": match["metadata"]["text"],
                                    "score": match["score"] * 0.9  # Lower priority than direct matches
                                })
                                print(f"Added continuity document for term '{term}' with score {match['score']:.4f}")
        
        # Cap at top_k (which was determined adaptively)
        filtered_results = filtered_results[:top_k]
        
        # Log document retrieval results
        print(f"Retrieved {len(filtered_results)} documents after filtering")
        for i, doc in enumerate(filtered_results[:5]):  # Log first 5 for brevity
            print(f"Doc {i+1} score: {doc['score']:.4f}")
        if len(filtered_results) > 5:
            print(f"... and {len(filtered_results) - 5} more documents")
        
        # Apply strategy-specific processing
        if strategy == "detailed":
            # For detailed queries, prioritize longer, more detailed documents
            processed_docs = sorted(filtered_results, key=lambda x: len(x["text"]), reverse=True)
        elif strategy == "comprehensive":
            # For comprehensive queries, maximize coverage
            processed_docs = filtered_results  # Already sorted by score
        else:
            # Default to score-based sorting
            processed_docs = sorted(filtered_results, key=lambda x: x["score"], reverse=True)
        
        # Combine into context, with a reasonable limit to avoid context overflow
        MAX_CONTEXT_LENGTH = 100000  # Adjust based on your model's context window
        context = ""
        total_length = 0
        
        for doc in processed_docs:
            doc_text = doc["text"]
            if total_length + len(doc_text) + 2 <= MAX_CONTEXT_LENGTH:  # +2 for newlines
                context += doc_text + "\n\n"
                total_length += len(doc_text) + 2
            else:
                break
                
        # Trim context if still too long (rare case with many short docs)
        if len(context) > MAX_CONTEXT_LENGTH:
            context = context[:MAX_CONTEXT_LENGTH]

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
        
        print(f"Context length: {len(context)} characters")

        # Fallback if context is empty despite having documents
        if len(context) == 0 and filtered_results:
            print("WARNING: Empty context despite having documents! Using fallback...")
            # Just use the raw documents directly
            context = ""
            for doc in filtered_results:
                context += doc["text"] + "\n\n"
            print(f"Fallback context length: {len(context)} characters")
            
            # If still empty, try using the raw metadata from the matches
            if len(context) == 0 and pinecone_results["matches"]:
                print("WARNING: Second fallback - using raw matches...")
                context = ""
                for match in pinecone_results["matches"][:min_docs]:
                    if "text" in match["metadata"]:
                        context += match["metadata"]["text"] + "\n\n"
                print(f"Second fallback context length: {len(context)} characters")

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
        print("Model Response:", response.text)

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response.text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def extract_important_terms(text, max_terms=5):
    """Extract important terms from a text that might be relevant for continuity."""
    # Simple implementation using frequency and filtering
    stop_words = set(stopwords.words('english'))
    tokens = word_tokenize(text.lower())
    
    # Filter out stopwords and punctuation
    filtered_tokens = [token for token in tokens if token not in stop_words 
                       and token not in string.punctuation
                       and len(token) > 3]  # Only consider words with length > 3
    
    # Count frequency
    freq = Counter(filtered_tokens)
    
    # Get most common terms
    return [term for term, count in freq.most_common(max_terms)]

def is_followup_question(query):
    """Determine if a query is likely a follow-up question."""
    # List of phrases and patterns that indicate follow-up questions
    followup_indicators = [
        "what about", "tell me more", "can you elaborate", "more details",
        "and", "also", "in addition", "moreover", "furthermore",
        "why", "how", "when", "where", "which one", "could you explain"
    ]
    
    query_lower = query.lower()
    
    # Check for pronouns that suggest reference to previous context
    pronouns = ["it", "this", "that", "these", "those", "they", "them", "their"]
    has_pronouns = any(f" {pronoun} " in f" {query_lower} " for pronoun in pronouns)
    
    # Check for follow-up indicators
    has_indicators = any(indicator in query_lower for indicator in followup_indicators)
    
    # Short questions are often follow-ups
    is_short_question = len(query_lower.split()) <= 5
    
    return has_pronouns or has_indicators or is_short_question

if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=8080)