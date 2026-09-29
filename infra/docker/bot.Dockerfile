# Bot service (CLAUDE.md §9): the bot package plus the rules engine it plays on. Build from the repo root.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN pip install "uvicorn>=0.35"

COPY backend/game/__init__.py game/__init__.py
COPY backend/game/engine game/engine
COPY bot bot

RUN useradd --system --uid 1001 app && chown -R app /app
USER app
EXPOSE 8100
HEALTHCHECK --interval=10s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/health', timeout=2)"
CMD ["uvicorn", "bot.service:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]
