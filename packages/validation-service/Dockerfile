# Validation Service Dockerfile
# Python FastAPI service for deep AAS validation

FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pip-tools for dependency management
RUN pip install --no-cache-dir pip-tools

# Copy project files
COPY pyproject.toml ./
COPY src ./src

# Install dependencies
RUN pip install --no-cache-dir .

# Production stage
FROM base AS production

# Create non-root user
RUN useradd --create-home appuser
USER appuser

# Environment
ENV HOST=0.0.0.0
ENV PORT=8000
ENV DEBUG=false

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start server
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
