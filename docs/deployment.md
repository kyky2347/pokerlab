# Deployment / 部署

## Local / 本地

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000`; FastAPI and OpenAPI run at `http://localhost:8000` and `/docs`. SQLite is created automatically in `apps/api/pokerlab.db`.

## PostgreSQL

```bash
docker compose up -d postgres
DATABASE_URL=postgresql+psycopg://pokerlab:pokerlab_dev@localhost:5432/pokerlab pnpm dev
```

Install a PostgreSQL DBAPI such as `psycopg[binary]` before selecting this URL. Do not expose service-role database credentials to `NEXT_PUBLIC_*` variables.

## Production shape / 生产形态

- Build web: `pnpm --filter web build`, then `pnpm --filter web start`.
- Run API: `cd apps/api && uv run uvicorn pokerlab_api.main:app --host 0.0.0.0 --port 8000`.
- Point `NEXT_PUBLIC_API_URL` at the public API origin.
- Configure a narrow `CORS_ORIGINS` list.
- Preserve iteration safety limits on public deployments.

Sentry, Supabase, Neon, Vercel, and other cloud services are optional. 缺少任何云端凭据都不会阻止核心应用启动。
