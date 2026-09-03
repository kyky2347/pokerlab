# Deployment / 部署

PokerLab is local-first: neither the native workflow nor the container workflow requires a cloud account. The checked-in version files and lockfiles are the reproducibility contract.

PokerLab 采用本地优先设计：原生开发与容器启动都不依赖云账号。仓库中的版本文件与锁文件共同构成可复现契约。

## Native development / 本地开发

Prerequisites / 环境要求：

- Node.js 24+ and pnpm 11+
- Python 3.12 and `uv`
- Rust 1.88+ for the PyO3 accelerator

```bash
git clone https://github.com/kyky2347/pokerlab.git
cd pokerlab
corepack enable
make setup
make dev
```

The web app runs at <http://localhost:3000>. FastAPI runs at <http://localhost:8000>, with health diagnostics at `/health` and interactive OpenAPI documentation at `/docs`. SQLite is created automatically in `apps/api/pokerlab.db`.

Web 界面位于 <http://localhost:3000>；FastAPI 位于 <http://localhost:8000>，`/health` 提供健康诊断，`/docs` 提供交互式 OpenAPI 文档。SQLite 数据库会自动创建在 `apps/api/pokerlab.db`。

## Reproducible containers / 可复现容器

The repository launcher provides the recommended one-command deployment. It checks Docker, generates an ignored random database credential with owner-only permissions, builds and starts every service, waits for their health checks, and opens the product:

仓库启动器提供推荐的一键部署方式。它会检查 Docker、生成被 Git 忽略且仅当前用户可读的随机数据库凭据、构建并启动全部服务、等待健康检查，然后打开产品：

```bash
./pokerlab
```

The product opens at <http://localhost:3000>. Operational commands are bilingual:

产品会在 <http://localhost:3000> 打开。运维命令提供中英文输出：

```bash
./pokerlab status
./pokerlab logs api
./pokerlab stop
```

`stop` preserves the PostgreSQL volume. The generated `.pokerlab.env` file is local-only and ignored by both Git and Docker build contexts. PostgreSQL is reachable only on the private Compose network; it is not published to the host.

`stop` 会保留 PostgreSQL 数据卷。生成的 `.pokerlab.env` 仅存在于本机，并被 Git 与 Docker 构建上下文同时忽略。PostgreSQL 只在 Compose 私有网络内可访问，不会暴露到宿主机。

## Configuration / 配置

Copy `.env.example` for native development when defaults are not suitable. For manual Compose usage, copy it to `.env`, replace the placeholder database password, and pass `--env-file .env`. The launcher handles this automatically for normal use.

原生开发需要覆盖默认值时，可复制 `.env.example`。手动使用 Compose 时，将其复制为 `.env`，替换数据库密码占位符，并传入 `--env-file .env`；正常使用启动器时这些步骤会自动完成。

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
