FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV CREWAI_DISABLE_TELEMETRY=true
ENV CREWAI_DISABLE_TRACKING=true

WORKDIR /app

COPY requirements.txt /app/requirements.txt
COPY legal_discovery_ai/requirements.txt /app/legal_discovery_ai/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
