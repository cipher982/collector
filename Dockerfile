FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN pip install flask psycopg2-binary python-dotenv

CMD ["python", "app.py"]