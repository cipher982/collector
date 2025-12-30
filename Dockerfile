FROM oven/bun:1 AS library-builder

WORKDIR /build
COPY lib/package.json lib/tsconfig.json lib/tsup.config.ts ./
COPY lib/src ./src
RUN bun install --frozen-lockfile
RUN bun run build

FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN pip install uv

# Copy built library from builder stage
COPY --from=library-builder /build/dist/index.min.js static/v1/context.min.js
COPY --from=library-builder /build/dist/index.min.js.map static/v1/context.min.js.map

# Install dependencies
RUN uv sync

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
	CMD curl -f http://localhost:5000/health || exit 1

# Run with Gunicorn using the Gevent WebSocket worker so that
# Flask-SocketIO can handle both HTTP and WebSocket traffic in a single
# process.  Two workers are usually enough for small containers; tune as
# needed via docker-compose overrides or env vars.

CMD ["uv", "run", "gunicorn", "-k", "geventwebsocket.gunicorn.workers.GeventWebSocketWorker", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]