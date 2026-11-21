
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM python:3.12-slim AS api
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
WORKDIR /app/services
ENV UV_PYTHON_DOWNLOADS=never PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY services/pyproject.toml services/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY services/skillforge/ ./skillforge/
COPY --chmod=755 scripts/start-render.sh /usr/local/bin/skillforge-start
COPY --from=frontend /build/dist /app/apps/web/dist
ENV PATH="/app/services/.venv/bin:$PATH" APP_ENV=production SCAN_WORKER_ENABLED=false
RUN useradd --system --uid 10001 --no-create-home skillforge
USER 10001
EXPOSE 8765
CMD ["python", "-m", "uvicorn", "skillforge.main:app", "--host", "0.0.0.0", "--port", "8765", "--no-access-log"]
