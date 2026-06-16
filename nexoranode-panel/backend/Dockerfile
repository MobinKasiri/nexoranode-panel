FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY panel/ ./panel/
COPY scripts/ ./scripts/
COPY alembic.ini .
COPY alembic/ ./alembic/

ENV PYTHONPATH=/bot:/app
EXPOSE 8000

CMD ["uvicorn", "panel.main:app", "--host", "0.0.0.0", "--port", "8000"]
