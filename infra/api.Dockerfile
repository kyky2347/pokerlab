FROM rust:1.88-bookworm AS rust-toolchain

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
COPY --from=rust-toolchain /usr/local/cargo /usr/local/cargo
COPY --from=rust-toolchain /usr/local/rustup /usr/local/rustup
ENV CARGO_HOME="/usr/local/cargo" \
    RUSTUP_HOME="/usr/local/rustup" \
    RUSTUP_TOOLCHAIN="1.88.0" \
    UV_HTTP_TIMEOUT="120" \
    PATH="/usr/local/cargo/bin:$PATH"
RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY packages/poker-core ./packages/poker-core
COPY apps/api/pyproject.toml apps/api/uv.lock ./apps/api/
COPY apps/api/pokerlab_api ./apps/api/pokerlab_api
WORKDIR /workspace/apps/api
RUN uv sync --frozen --no-dev --no-editable

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime
ENV PATH="/workspace/apps/api/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL="sqlite:////data/pokerlab.db"
WORKDIR /workspace/apps/api
COPY --from=builder /workspace/apps/api/.venv ./.venv
COPY apps/api/pokerlab_api ./pokerlab_api
RUN useradd --create-home --uid 10001 pokerlab \
    && mkdir -p /data \
    && chown pokerlab:pokerlab /data
USER pokerlab
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "pokerlab_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
