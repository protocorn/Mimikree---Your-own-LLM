# Use an official Python runtime as a parent image
FROM python:3.13.1

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir Flask pinecone sentence-transformers langchain-core langchain-community langchain langchain-text-splitters waitress google-generativeai datetime

# Create utils directory if it doesn't exist to ensure proper structure
RUN mkdir -p /app/utils

# Make sure utils is recognized as a package
RUN touch /app/utils/__init__.py
# Expose port
EXPOSE 8080

# Run the app using waitress
CMD ["python", "-m", "llama_service"]
