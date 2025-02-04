from flask import Flask, request, jsonify
import numpy as np
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from langchain.retrievers import BM25Retriever, EnsembleRetriever
from langchain.vectorstores import FAISS
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.llms import Ollama

app = Flask(__name__)

# Initialize embedding model
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")

# Initialize empty document store
documents = []

# Create vector store and retrievers (initialized later when data arrives)
vector_store = None
vector_retriever = None
bm25_retriever = None
ensemble_retriever = None

# Structured prompt template
prompt_template = ChatPromptTemplate.from_template(
    "You have to mimic a person based on their profile and speaking style.\n\n"
    "### Profile Information ###\n"
    "{context}\n\n"
    "### Instruction ###\n"
    "- Respond in a way that matches the person's tone, phrasing, and vocabulary.\n"
    "- Stay consistent with their typical opinions and speaking style.\n"
    "- If context is unclear, make reasonable assumptions based on the provided details.\n\n"
    "### Question ###\n"
    "{question}\n\n"
    "### Response ###"
)

# Initialize language model
llm = Ollama(model="llama2:13b")


@app.route('/process', methods=['POST'])
def process_document():
    """Receives GitHub & Twitter data and updates retrievers dynamically."""
    global documents, vector_store, vector_retriever, bm25_retriever, ensemble_retriever

    try:
        data = request.json
        document_text = data.get("document", "")

        if not document_text:
            return jsonify({"error": "No document provided"}), 400

        # Store the document text
        documents.append(document_text)

        # Update FAISS Vector Store
        vector_store = FAISS.from_texts(documents, embeddings)
        vector_retriever = vector_store.as_retriever(search_kwargs={"k": 10})

        # Update BM25 Retriever
        bm25_retriever = BM25Retriever.from_texts(documents, k=10)

        # Update Ensemble Retriever
        ensemble_retriever = EnsembleRetriever(
            retrievers=[bm25_retriever, vector_retriever],
            weights=[0.2, 0.8]
        )

        return jsonify({"success": True, "message": "Document processed successfully"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/ask', methods=['POST'])
def ask():
    """Handles user queries based on stored GitHub & Twitter data."""
    global ensemble_retriever

    try:
        data = request.json
        query_text = data.get("query", "")

        if not query_text:
            return jsonify({"error": "No query provided"}), 400

        if not ensemble_retriever:
            return jsonify({"error": "No data available to query"}), 400

        # Retrieve relevant documents
        retrieved_docs = ensemble_retriever.get_relevant_documents(query_text)
        context = "\n".join([doc.page_content for doc in retrieved_docs])
        
        print(context)

        # Generate prompt
        prompt = prompt_template.format(context=context, question=query_text)
        print("processing response Please wait...")
        # Generate response
        response = llm.predict(prompt)
        print("response: ", response)

        return jsonify({
            "success": True,
            "query": query_text,
            "response": response
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5002, debug=True)
