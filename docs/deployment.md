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
./pokerlab start --no-build --no-open
```

`stop` preserves the PostgreSQL volume. The generated `.pokerlab.env` file is local-only and ignored by both Git and Docker build contexts. PostgreSQL is reachable only on the private Compose network; it is not published to the host.

`stop` 会保留 PostgreSQL 数据卷。生成的 `.pokerlab.env` 仅存在于本机，并被 Git 与 Docker 构建上下文同时忽略。PostgreSQL 只在 Compose 私有网络内可访问，不会暴露到宿主机。

Use `--no-build` only to restart unchanged, previously built images. Normal startup still builds current source. Invalid restart options are rejected before services are stopped. `status`, `logs`, and `stop` never create new credentials.

只有代码未变且镜像已构建时才使用 `--no-build`；正常启动仍会构建当前源码。错误的重启参数会在停止服务之前被拒绝。`status`、`logs` 和 `stop` 不会生成新凭据。

Back up `.pokerlab.env` privately alongside the database. Configuration creation is atomic and owner-only, including simultaneous launches. If a database volume already exists but the configuration is missing, startup refuses to generate a replacement password: restore the original configuration from backup. Do not delete the volume to bypass this safeguard unless you explicitly intend to discard its data. Empty files and symbolic links are rejected rather than overwritten.

请将 `.pokerlab.env` 与数据库一起私密备份。配置采用原子创建与仅所有者可读写权限，并发启动也不会覆盖凭据。如果数据库卷已存在但配置缺失，启动器会拒绝生成替代密码：请从备份恢复原配置。除非明确需要丢弃数据，否则不要删除数据卷来绕过保护。空文件与符号链接会被拒绝，而不是覆盖。

## Database upgrades and recovery / 数据库升级与恢复

The API runs packaged Alembic migrations before serving requests. Fresh databases are initialized automatically; the original three-table PokerLab layout is recognized and brought under version control without recreating its tables. Existing versioned databases are upgraded normally. Incomplete or unfamiliar unversioned layouts are rejected for manual investigation. `/diagnostics` exposes the live `schema_revision`.

API 在接收请求前运行随包分发的 Alembic 迁移。空数据库自动初始化；原版 PokerLab 的三表结构会被识别并纳入版本管理，不会重建已有表。已有版本记录的数据库按迁移链升级。结构不完整或无法识别的无版本数据库会被拒绝，需人工排查。`/diagnostics` 返回实时 `schema_revision`。

Before updating an existing installation, stop writes and take a verified database backup plus a private backup of `.pokerlab.env`. Upgrades may take a schema lock while widening PostgreSQL's seed column or adding indexes, so use a maintenance window for large databases. Startup migration transactions are serialized across workers. This release preserves stored experiments, answers, and solver jobs and uses a forward-only migration: rollback requires restoring a pre-upgrade backup and the corresponding application version, not downgrading columns or dropping training records.

更新已有安装前，请停止写入、制作并验证数据库备份，同时私密备份 `.pokerlab.env`。PostgreSQL 扩展种子字段或添加索引时可能持有结构锁，大型数据库请安排维护窗口。各进程的启动迁移事务会串行执行。本版保留已存储的实验、成绩和求解记录，迁移仅支持向前升级：回滚需恢复升级前备份与对应应用版本，而不是缩窄字段或删除训练记录。

To migrate separately from API startup / 单独执行迁移：

```bash
cd apps/api
uv run python -m pokerlab_api.migrations
```

This command uses `DATABASE_URL`, including the native `.env` configuration. In a running Compose installation, use `docker compose --env-file .pokerlab.env exec api python -m pokerlab_api.migrations`. No separate command is required for normal `./pokerlab` startup.

此命令使用 `DATABASE_URL`，包括本地 `.env` 配置。已运行的 Compose 安装可使用 `docker compose --env-file .pokerlab.env exec api python -m pokerlab_api.migrations`。正常运行 `./pokerlab` 无需额外迁移命令。

An unavailable or misconfigured PostgreSQL database now prevents startup instead of silently falling back to a separate SQLite ledger. Correct its connectivity, credentials, or DDL permissions and retry; do not delete the data volume. SQLite remains the native default, and the independent Rust-to-Python engine fallback is unchanged.

PostgreSQL 不可用或配置错误时，现在会阻止启动，不再悄悄回退到另一份 SQLite 台账。请修复连接、凭据或 DDL 权限后重试，不要删除数据卷。原生开发默认仍使用 SQLite，独立的 Rust → Python 引擎自动回退保持不变。

Training questions created after this update remain answerable for 24 hours across workers and API restarts. Claiming a question and writing its score happen in one transaction: duplicate submissions cannot add duplicate scores, and a failed write leaves the question available for retry. Question records retain the actual cards, seed, engine, and adaptive weight; adaptive selection depends on answer history as well as the seed. The correct equity is never included in the question response. Old in-memory questions issued before upgrading must be regenerated; stored answer history is preserved. A full browser reload may request a new question—this guarantee concerns the issued question ID, not restoration of browser form state.

本次更新后创建的训练题在 24 小时内可跨进程和 API 重启提交。领取题目评分权与写入成绩处于同一事务：重复提交不会产生重复成绩，写入失败后仍可重试。题目保存实际牌面、种子、引擎和自适应权重；自适应抽样除种子外还依赖答题历史。出题响应不会泄露正确胜率。升级前尚未提交的内存题目需重新生成，已保存成绩不受影响。浏览器整页刷新可能重新出题；此保证针对已签发的题目 ID，不代表恢复浏览器表单状态。

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
- Use `/health` for liveness and `/diagnostics` for a live database check, the selected engine, and the Kuhn self-test result computed at this process's startup. Repeated diagnostic polls do not rerun the solver. / 用 `/health` 检查进程存活，用 `/diagnostics` 检查实时数据库连通性、实际引擎与本次进程启动时计算的 Kuhn 自检结果；重复轮询不会重新运行求解器。
- Do not describe the finite river abstraction as a full-game GTO solver. / 不要把有限河牌抽象描述为完整牌局 GTO 求解器。

The Python engine remains an automatic runtime fallback if the compiled Rust extension cannot load. This preserves availability, while diagnostics and every experiment record continue to expose the selected engine.

若编译后的 Rust 扩展无法加载，系统会自动回退到 Python 引擎；健康诊断和每条实验记录仍会公开实际使用的引擎，从而兼顾可用性与可审查性。
