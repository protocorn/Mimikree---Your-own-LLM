# Multi-stage build to reduce final image size
FROM python:3.12-slim as builder

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/root/.cache/huggingface \
    TRANSFORMERS_CACHE=/root/.cache/huggingface/transformers \
    SENTENCE_TRANSFORMERS_HOME=/root/.cache/torch/sentence_transformers

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements
COPY requirements.txt /app/

# Install PyTorch CPU-only version first (much smaller than GPU version)
# This prevents sentence-transformers from pulling the full GPU version
RUN pip install --no-cache-dir --user torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining requirements
RUN pip install --no-cache-dir --user -r requirements.txt

# Pre-download the sentence-transformers model to avoid runtime downloads
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"

# Clean up unnecessary files to reduce image size
RUN find /root/.local -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -name "*.pyc" -delete && \
    find /root/.local -name "*.pyo" -delete && \
    find /root/.local -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# Final stage - minimal runtime image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/root/.local/bin:$PATH \
    HF_HOME=/root/.cache/huggingface \
    TRANSFORMERS_CACHE=/root/.cache/huggingface/transformers \
    SENTENCE_TRANSFORMERS_HOME=/root/.cache/torch/sentence_transformers

# Install only runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Copy HuggingFace cache (contains pre-downloaded models)
COPY --from=builder /root/.cache /root/.cache

# Copy application code
COPY llama_service.py /app/
COPY utils/ /app/utils/

# Ensure utils is a package
RUN mkdir -p /app/utils && touch /app/utils/__init__.py

# Expose port
EXPOSE 8080

# Run the app using waitress
CMD ["python", "-m", "llama_service"]
