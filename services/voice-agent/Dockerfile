# Build context: services/voice-agent
FROM python:3.11-slim

WORKDIR /app

# Install uv (fast Python package manager / runner)
RUN pip install --no-cache-dir uv

# Copy dependency manifests first for layer caching
COPY pyproject.toml uv.lock ./

# Sync deps into the project's .venv
RUN uv sync --frozen --no-dev

# Copy rest of the service
COPY . .

# LiveKit Agents worker: "start" mode connects to the LiveKit server and
# waits for room assignments (long-running worker process).
CMD ["uv", "run", "python", "agent.py", "start"]
