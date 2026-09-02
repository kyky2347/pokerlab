# Deployment / 部署

PokerLab is local-first: neither the native workflow nor the container workflow requires a cloud account. The checked-in version files and lockfiles are the reproducibility contract.

PokerLab 采用本地优先设计：原生开发与容器启动都不依赖云账号。仓库中的版本文件与锁文件共同构成可复现契约。

## Native development / 本地开发

Prerequisites / 环境要求：

- Node.js 24+ and pnpm 11+
- Python 3.12 and `uv`
- Rust 1.88+ for the PyO3 accelerator

```bash
git clone https://github.com/kyky2347/project-s8qftxtm.git
cd project-s8qftxtm
corepack enable
make setup
make dev
```

The web app runs at <http://localhost:3000>. FastAPI runs at <http://localhost:8000>, with health diagnostics at `/health` and interactive OpenAPI documentation at `/docs`. SQLite is created automatically in `apps/api/pokerlab.db`.

Web 界面位于 <http://localhost:3000>；FastAPI 位于 <http://localhost:8000>，`/health` 提供健康诊断，`/docs` 提供交互式 OpenAPI 文档。SQLite 数据库会自动创建在 `apps/api/pokerlab.db`。

## Reproducible containers / 可复现容器

Docker Compose starts the production-built web app, the Rust-accelerated API, and PostgreSQL:

Docker Compose 会启动生产构建的 Web、Rust 加速 API 与 PostgreSQL：

```bash
docker compose up --build
```

Wait until all three services are healthy, then open <http://localhost:3000>. Stop the stack without deleting data using:

等待三个服务均健康后打开 <http://localhost:3000>。以下命令会停止服务但保留数据：

```bash
docker compose down
```

Only append `-v` when you intentionally want to delete the PostgreSQL volume. / 只有明确需要删除 PostgreSQL 数据卷时才追加 `-v`。

## Configuration / 配置

Copy `.env.example` for native development when defaults are not suitable. Compose already supplies its internal service URLs.

原生开发需要覆盖默认值时，可复制 `.env.example`；Compose 已内置容器间服务地址。

| Variable / 变量                   | Purpose / 用途                                     | Production guidance / 生产建议                                                                                             |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | SQLAlchemy database URL / 数据库地址               | Use a managed PostgreSQL URL; never expose it through `NEXT_PUBLIC_*`. / 使用托管 PostgreSQL，且不要放入 `NEXT_PUBLIC_*`。 |
| `NEXT_PUBLIC_API_URL`             | Browser-visible API origin / 浏览器访问的 API 地址 | Set the public HTTPS API origin. / 设置公开 HTTPS API 地址。                                                               |
| `CORS_ORIGINS`                    | Allowed web origins / 允许的 Web 来源              | Use an explicit, narrow list. / 使用明确且最小化的列表。                                                                   |
| `POKERLAB_MAX_MONTE_CARLO`        | Monte Carlo request ceiling / 蒙特卡洛请求上限     | Keep bounded on public services. / 公网服务必须保持上限。                                                                  |
| `POKERLAB_MAX_SOLVER_ITERATIONS`  | CFR iteration ceiling / CFR 迭代上限               | Keep bounded; solver jobs are CPU intensive. / 保持限制；求解任务消耗 CPU。                                                |
| `POKERLAB_MAX_CONCURRENT_SOLVERS` | Concurrent CFR jobs / CFR 并发数                   | Size from measured CPU capacity. / 按实测 CPU 容量设置。                                                                   |

## Production checklist / 生产检查清单

- Run `make check` and `pnpm --filter web test:e2e` against the release commit. / 对发布提交运行完整质量门禁与浏览器测试。
- Terminate TLS at a trusted reverse proxy or platform edge. / 在可信反向代理或平台边缘终止 TLS。
- Restrict `CORS_ORIGINS` to the deployed web origin. / 将 CORS 限制到实际 Web 域名。
- Persist the database and back it up before upgrades. / 持久化数据库并在升级前备份。
- Keep compute safety limits and request timeouts enabled. / 保留计算上限与请求超时。
- Monitor `/health`; it reports the selected Rust or Python engine without fabricating availability. / 监控 `/health`；它会如实报告当前 Rust 或 Python 引擎。
- Do not describe the finite river abstraction as a full-game GTO solver. / 不要把有限河牌抽象描述为完整牌局 GTO 求解器。

The Python engine remains an automatic runtime fallback if the compiled Rust extension cannot load. This preserves availability, while diagnostics and every experiment record continue to expose the selected engine.

若编译后的 Rust 扩展无法加载，系统会自动回退到 Python 引擎；健康诊断和每条实验记录仍会公开实际使用的引擎，从而兼顾可用性与可审查性。
