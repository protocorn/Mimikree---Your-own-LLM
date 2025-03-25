# Use an official Python runtime as a parent image
FROM python:3.13.1

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir Flask pinecone sentence-transformers langchain-core waitress google-generativeai
# Expose port
EXPOSE 8080

# Run the app using waitress
CMD ["python", "-m", "llama_service"]
