FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN pip install uv

# Install dependencies
RUN uv sync

# CMD ["uv", "run", "python", "app.py"]
CMD ["tail", "-f", "/dev/null"]