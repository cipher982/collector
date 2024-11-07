FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN pip install uv

# Install dependencies
RUN uv sync

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
	CMD curl -f http://localhost:5000/health || exit 1

CMD ["uv", "run", "python", "app.py"]