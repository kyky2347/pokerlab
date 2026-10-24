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

Web and API host ports bind to `127.0.0.1`, not every network interface. Other local applications can still connect; this is a local-first default, not user authentication. Upgrade Docker Engine to 28.0.0 or newer: older releases have a [documented localhost-publishing limitation](https://docs.docker.com/engine/network/port-publishing/) affecting machines on the same network segment. Do not change daemon routing/firewall settings to make this unauthenticated API publicly reachable.

Web 与 API 的宿主机端口绑定 `127.0.0.1`，不再绑定所有网卡。其他本机应用仍可连接；这是本地优先的默认配置，不是用户认证。请使用 Docker Engine 28.0.0 或更新版本：旧版存在[官方记录的 localhost 端口发布限制](https://docs.docker.com/engine/network/port-publishing/)，同网段机器可能访问本机绑定的端口。不要通过修改 Docker 路由或防火墙让这个无认证 API 直接暴露到公网。

Use `--no-build` only to restart unchanged, previously built images. Normal startup still builds current source. Invalid restart options are rejected before services are stopped. `status`, `logs`, and `stop` never create new credentials.

只有代码未变且镜像已构建时才使用 `--no-build`；正常启动仍会构建当前源码。错误的重启参数会在停止服务之前被拒绝。`status`、`logs` 和 `stop` 不会生成新凭据。

Back up `.pokerlab.env` privately alongside the database. Configuration creation is atomic and owner-only, including simultaneous launches. If a database volume already exists but the configuration is missing, startup refuses to generate a replacement password: restore the original configuration from backup. Do not delete the volume to bypass this safeguard unless you explicitly intend to discard its data. Empty files and symbolic links are rejected rather than overwritten.

请将 `.pokerlab.env` 与数据库一起私密备份。配置采用原子创建与仅所有者可读写权限，并发启动也不会覆盖凭据。如果数据库卷已存在但配置缺失，启动器会拒绝生成替代密码：请从备份恢复原配置。除非明确需要丢弃数据，否则不要删除数据卷来绕过保护。空文件与符号链接会被拒绝，而不是覆盖。

### Custom local ports / 自定义本机端口

Choose two unused, distinct TCP ports. No Compose override file is needed:

选择两个未被占用且不同的 TCP 端口，无需创建 Compose 覆盖文件：

```bash
export POKERLAB_WEB_PORT=13000 POKERLAB_API_PORT=18000
./pokerlab
./pokerlab open
./pokerlab restart --no-open
```

The app opens at `http://localhost:13000`; API health and docs use `http://localhost:18000`. Export either port independently to keep the other's default (3000/8000). Values must be decimal integers from 1 to 65535 without leading zeros. Privileged ports may need additional host permissions; prefer unprivileged ports such as this example. Invalid/equal ports are rejected before Docker operations, and invalid Compose configuration is rejected before restart stops services. Port availability is enforced by Docker; the launcher never stops another application's containers or chooses random ports.

应用会在 `http://localhost:13000` 打开，API 健康检查和文档使用 `http://localhost:18000`。可以只设置一个端口，另一个保留默认值（3000/8000）。端口必须是 1 至 65535 的十进制整数，不能有前导零。低端口可能需要额外宿主机权限，建议使用示例中的非特权端口。非法或相同端口会在任何 Docker 操作前被拒绝；重启也会在停止服务前校验 Compose 配置。端口占用由 Docker 检查；启动器不会停止其他应用的容器，也不会随机选择端口。

Launcher ports are shell settings: repeat the exports in a new terminal; do not add them to `.pokerlab.env`. Keep the same values for subsequent commands. Unset both variables to return to the default ports. These settings do not create a separate installation or database, and existing `.pokerlab.env` contents are never rewritten.

启动器端口是终端环境设置：新开终端后需重新 `export`，不要把它们添加到 `.pokerlab.env`。后续命令应保留相同值；取消这两个环境变量即可恢复默认端口。这些设置不会创建另一套安装或数据库，也不会重写已有 `.pokerlab.env` 的内容。

When either port is exported, the launcher derives `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS` from the local ports, overriding values in legacy `.pokerlab.env` files. Explicit **shell** exports of these two URL settings take precedence for custom deployments. Without port exports, existing runtime-file URL settings keep their prior behavior. Manual Compose users must set ports and any explicitly configured API URL/CORS origins consistently themselves. The launcher does not source runtime files as shell scripts.

只要显式导出任一端口，启动器就会根据本机端口生成 `NEXT_PUBLIC_API_URL` 和 `CORS_ORIGINS`，覆盖旧 `.pokerlab.env` 中的对应值。若在**终端**中明确导出这两个 URL 设置，则以终端值为准，支持自定义部署。不导出端口时，运行配置文件中的 URL 设置继续保持原有行为。手动调用 Compose 时，需自行保持端口、显式 API 地址与跨域来源一致。启动器不会把运行配置当作 shell 脚本执行。

`POKERLAB_WEB_URL`, `POKERLAB_API_HEALTH_URL`, and `POKERLAB_API_DOCS_URL` remain optional overrides for browser/check/display URLs, such as a reverse proxy. They do not change port mappings or the frontend build URL. Next.js embeds the API URL at build time: after changing the API port or `NEXT_PUBLIC_API_URL`, run `./pokerlab` **without** `--no-build`. Reuse images only when both source and build-time configuration are unchanged.

`POKERLAB_WEB_URL`、`POKERLAB_API_HEALTH_URL` 和 `POKERLAB_API_DOCS_URL` 仍可覆盖浏览器、检查和展示地址，例如反向代理场景；它们不改变端口映射或前端构建地址。Next.js 在构建时写入 API 地址：修改 API 端口或 `NEXT_PUBLIC_API_URL` 后，请运行**不带** `--no-build` 的 `./pokerlab`。仅在源码与构建配置均未变更时复用镜像。

## Dependency runtime checks / 依赖运行时检查

After a frozen install, run from the repository root / 冻结安装后在仓库根目录运行：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:dependencies
```

This is also part of `pnpm check`. It resolves the shell-quote copy used by
`concurrently` and the sharp copy used by Next.js, verifies patched version
floors, rejects post-comment line terminators without executing them, and checks
normal command quoting/startup. Image tests perform actual SVG-to-PNG and lossless
WebP conversions and inspect decoded pixels. No services or network ports are
opened by these tests.

这项检查也已纳入 `pnpm check`。测试解析 `concurrently` 与 Next.js 实际使用的
shell-quote 和 sharp 副本，检查补丁版本下限，在不执行危险输入的情况下验证
注释后换行符被拒绝，并检查正常转义和命令启动。图像测试真实执行 SVG 转 PNG
及无损 WebP 转换，然后核对解码像素；不会启动服务或占用网络端口。

The container CI job additionally tests the **final runtime image**, not the
builder or host's node_modules. To reproduce / 容器 CI 还检测**最终运行镜像**，
而非构建阶段或宿主机的 node_modules。复现方式：

```bash
docker build -f infra/web.Dockerfile -t pokerlab-web:verify .
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --mount "type=bind,source=${PWD}/scripts,target=/workspace/scripts,readonly" \
  --entrypoint node pokerlab-web:verify --test scripts/image-runtime.test.mjs \
  scripts/deployment/standalone-runtime.test.mjs
```

Tests are mounted read-only; they are not added to the production image. Missing
native packages, outdated sharp/librsvg, incorrect pixels, or unexpected decoding
behavior fail the check. If using a global/custom libvips build, the loaded
librsvg must meet the same floor; unknown/prerelease versions fail deliberately.
Rebuild after security updates—`--no-build` continues to run old binaries.
These targeted checks do not replace `pnpm audit`; see [known risks](../SECURITY.md).

测试以只读方式挂载，不写入生产镜像。原生包缺失、sharp/librsvg 版本过旧、
像素不符或解码异常都会使检查失败。全局/自编译 libvips 使用的 librsvg 也需
满足同一版本下限，未知或预发布版本会主动失败。安全更新后必须重新构建，
`--no-build` 仍会运行旧二进制。这些定向检查不能替代 `pnpm audit`，已知风险见上述链接。

The standalone suite also starts the real production server inside the container,
requires Next.js 16.4.1 or newer, and checks all nine product routes and their
security headers. It fetches the homepage's referenced JavaScript/CSS assets to
catch incomplete runtime copies, checks 404 responses and remote-image rejection,
and verifies that the development MCP endpoint is not served. It also inspects
the built image/cache configuration and empty Server Action manifests against
the documented exposure boundaries. Startup, requests,
and shutdown are bounded; the server is stopped after the suite, including failures.
There are no host port mappings, external requests, API calls, or database writes.
Run this suite using the container command above, not directly in the checkout.

独立部署测试还会在容器内启动真实生产服务器，要求 Next.js 至少为 16.4.1，
检查九个产品路由及安全响应头，并获取首页引用的 JavaScript/CSS，发现运行镜像
漏复制资源的问题；同时检查 404、远程图片拒绝和开发 MCP 端点不可用，并对照
已公开的暴露边界检查构建后的图片/缓存配置与空 Server Action 清单。
启动、请求与关闭均有等待上限；无论成功或失败，测试后都会关闭服务器。
不会映射宿主机端口、请求外网、调用 API 或写入数据库。请用上面的容器命令
运行这组测试，不要在源码目录直接执行。

## API errors / API 错误

Application request failures before response headers are sent use JSON with an
`error` object containing `code`, `message` and `request_id`. Unexpected failures
return HTTP 500, a generic English/Chinese message and `Cache-Control: no-store`;
they never return an exception string or SQL bind values. Explicit 5xx errors
also hide their detail but retain their status and protocol headers such as
`Retry-After`. Existing 4xx HTTP `detail` fields and headers such as `Allow`
remain available; 422 poker/schema validation keeps its existing contract.

应用在发送响应头之前发生的请求错误使用 JSON，其中 `error` 包含 `code`、
`message` 和 `request_id`。未预期错误返回 HTTP 500、中英文通用提示及
`Cache-Control: no-store`，不返回异常正文或 SQL 参数。显式 5xx 同样隐藏细节，
保留状态码与 `Retry-After` 等协议响应头；既有 4xx HTTP `detail` 字段及
`Allow` 响应头仍可用，422 牌局/请求校验接口保持原有约定。

For correlation, supply an opaque `X-Request-ID` using 1–128 ASCII characters:
start with a letter/digit, then use letters, digits, `.`, `_`, `:` or `-`.
Surrounding whitespace is stripped. Missing or invalid IDs are replaced by a
fresh UUID; the accepted/generated ID appears in the response header and error
body. Trusted `CORS_ORIGINS` can read that header in JavaScript, including on
500 responses. CORS preflight remains Starlette-managed and does not enter this
request-ID boundary. An ID is **not authentication or an idempotency key** and
must not contain credentials or private data.

可发送不含隐私的 `X-Request-ID` 关联请求：去除首尾空白后为 1–128 个 ASCII
字符，以字母/数字开头，后续允许字母、数字及 `.`、`_`、`:`、`-`。缺失或非法
编号将替换为新 UUID；响应头与错误正文使用相同编号。可信 `CORS_ORIGINS`
可在 JavaScript 中读取该响应头，包括 500 响应。CORS 预检仍由 Starlette
处理，不进入此请求编号边界。编号**不是身份认证或幂等键**，不得放入凭据或隐私。

```bash
curl -i -H 'X-Request-ID: support-check-1' \
  http://localhost:8000/experiments/nonexistent-example
```

Structured `pokerlab` request logs retain the ID, route template, status, timing
and (for unexpected errors) exception class. They omit exception text/tracebacks,
query strings, request bodies and concrete path parameters. Use the ID and route
to investigate privately; don't publish full databases or logs. Uvicorn access
logs, reverse-proxy logs and third-party instrumentation are independent and
must be configured separately—never put secrets in URLs or request IDs.

`pokerlab` 结构化请求日志保留编号、路由模板、状态、耗时，以及未预期错误的
异常类型；不记录异常正文/堆栈、查询字符串、请求体或具体路径参数。用编号与
路由进行私下排查，不公开完整数据库或日志。Uvicorn 访问日志、反向代理日志及
第三方监控独立运行，需另行配置；不要把秘密放进 URL 或请求编号。

A 500 or lost response **does not establish whether a write committed**. Check
the experiment/job ledger before repeating a write; trainer answer recovery is
described below. This boundary does not add automatic retries, transactional
idempotency or solver changes. Streaming/background failures after headers are
sent cannot be replaced with this JSON response; process startup failures are
also outside the request boundary. Tests cover SQLite/PostgreSQL failure and
recovery, request-ID isolation, privacy, HTTP compatibility and CORS.

500 或响应丢失**不能证明写入是否已提交**。重试写操作前先核对实验/任务记录；
训练答题恢复见下文。此次不新增自动重试、事务幂等或求解器变更。响应头发出后
的流式/后台失败不能替换为此 JSON，进程启动失败也不属于请求边界。测试覆盖
SQLite/PostgreSQL 故障恢复、编号隔离、隐私、HTTP 兼容性与 CORS。

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

### Training feedback and retry boundaries / 训练反馈与重试边界

The trainer offers explicit **Retry scenario**, **Retry answer**, and **Start a new scenario** actions. A failed question request reuses its requested seed on retry; adaptive sampling still depends on the database history, so a seed alone does not guarantee the same scenario if that history changes. A failed answer preserves the estimate. Submissions lock the slider and rapid clicks cannot launch overlapping requests in this page. Mutations attempt the local API even if the browser reports offline, fail visibly if unreachable, and do not automatically retry or queue a write for reconnection.

训练页提供明确的**重试出题**、**重试提交答案**及**开始新题**操作。出题失败后重试使用原请求种子；自适应抽样仍依赖数据库历史，因此历史变化时，仅相同种子不能保证相同牌局。提交失败保留估计值，提交期间锁定滑块，本页面的快速点击不会触发重叠请求。即使浏览器报告离线，仍尝试访问本地 API；无法访问时明确报错，不自动重试或在网络恢复后补发写入。

The previous confirmed round remains visible while the next question loads or fails; it clears only after the replacement arrives. Page progress uses running totals of successfully received answers, starts with unavailable averages rather than a fictitious zero error, and resets on navigation/reload. Weaknesses are a **database-wide snapshot from the latest confirmed answer**, retained across rounds, not a separate user account or a live query. A lost response may already have saved a score but is not counted in this page's confirmed totals. No per-user authentication or response-replay guarantee is added.

下一题加载中或失败时，保留上一轮已确认结果，收到新题后才清除。页面进度累计成功收到的答案反馈，未作答时平均值显示“—”而非虚假的零误差；离开或刷新页面后重置。薄弱项是**最近一次已确认答案返回的全数据库快照**，跨题保留，不代表独立用户账号或实时查询。响应丢失时成绩可能已保存，但不计入本页面已确认统计。本次不新增用户认证或成功响应重放保证。

Frontend recovery regressions / 前端恢复回归：

```bash
pnpm --filter web exec vitest run src/app/trainer/page.test.tsx src/components/ui/slider.test.tsx
```

Scoring claims the question, inserts and explicitly flushes the answer, queries weaknesses, and prepares the complete response **before** committing the same transaction. A pre-commit insertion or feedback failure rolls back both the answer and the claim; retry the same question ID while it is unexpired. There are no response-building database reads after commit. This also supports direct Python sessions with `autoflush=False` or `expire_on_commit=True`. Feedback includes the current answer and preserves historical scores; tied mean errors are ordered by category. Concurrent answers to other questions may commit after the feedback query, so this is a transaction-time view, not a permanently current leaderboard.

评分依次领取题目、插入并明确 flush 答案、查询薄弱项，然后在同一事务提交**之前**准备完整响应。提交前的写入或反馈失败会同时回滚成绩与题目领取状态；在未过期时可使用同一题目 ID 重试。成功提交后不再为响应读取数据库，也支持 `autoflush=False` 或 `expire_on_commit=True` 的直接 Python 会话。反馈包含当前答案且保留历史成绩；平均误差相同时按类别排序。其他题目的并发答案可能在反馈查询后提交，因此反馈是事务期间的视图，不是永久最新的排行榜。

This is **not** exactly-once HTTP delivery or automatic replay of a successful response. If the commit succeeds but its acknowledgement or the HTTP response is lost, the answer may already be saved and a retry can return “already answered.” Inspect `/trainer/weaknesses` for the aggregate history; it does not recover a particular lost round's response. Do not manually clear the claim or delete the score to retry. There is no new migration, scoring rule, question lifetime, seed selection rule, or engine-selection behavior in this change.

这**不是** HTTP 响应恰好送达一次或成功响应自动重放的保证。如果数据库提交成功但确认信息或 HTTP 响应丢失，成绩可能已保存，重试可能返回“已提交”。`/trainer/weaknesses` 可查看汇总历史，但不能恢复某一轮丢失的响应；不要手动清空领取标记或删除成绩来重试。本次不新增迁移，不改变评分规则、题目有效期、种子选题规则或引擎选择行为。

Regression coverage / 回归验证:

```bash
cd apps/api
uv run pytest tests/test_trainer_transactions.py tests/test_trainer.py
```

Set `POKERLAB_TEST_POSTGRES_URL` to a disposable PostgreSQL database to run the same cases against both backends. Tests cover rollback/retry after injected insert, feedback and pre-commit failures, eight concurrent claimants with one failed feedback query, explicit transaction order, session options, stable ties and real HTTP-handler recovery. / 将 `POKERLAB_TEST_POSTGRES_URL` 指向临时 PostgreSQL 数据库可同时验证两种后端；测试覆盖写入、反馈、提交前故障后的回滚重试，八路并发领取中的单次反馈失败，明确的事务顺序、会话选项、稳定并列排序与真实 HTTP 处理器恢复。

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

- Run `make check` and `pnpm --filter web test:e2e` against the release commit. Browser tests create an isolated local stack; they do not target your live deployment. See [isolation details](browser-testing.md). / 对发布提交运行完整质量门禁与浏览器测试；浏览器测试创建独立本地环境，不会指向正在使用的部署，详见[隔离说明](browser-testing.md)。
- Terminate TLS at a trusted reverse proxy or platform edge. / 在可信反向代理或平台边缘终止 TLS。
- Put every API route behind authentication and authorization before any shared/public deployment; PokerLab does not provide built-in accounts, and CORS is not authentication. Keep the default loopback bindings, or use a private container network to reach a trusted gateway. / 共享或公开部署前，必须为全部 API 路由配置身份认证与授权；PokerLab 没有内置账号，CORS 不是身份认证。保持默认回环绑定，或通过私有容器网络连接可信网关。
- Restrict `CORS_ORIGINS` to the deployed web origin. / 将 CORS 限制到实际 Web 域名。
- Persist the database and back it up before upgrades. / 持久化数据库并在升级前备份。
- Keep compute safety limits and request timeouts enabled. / 保留计算上限与请求超时。
- Use `/health` for liveness and `/diagnostics` for a live database check, the selected engine, and the 20,000-iteration Kuhn self-test computed at this worker's startup. `/solver/kuhn-verification` reads that same complete snapshot: neither repeated nor concurrent reads rerun CFR. Each worker recomputes on restart; this is not live verification of subsequent river jobs. / 用 `/health` 检查进程存活，用 `/diagnostics` 检查实时数据库连通性、实际引擎与当前工作进程启动时计算的 20,000 轮 Kuhn 自检；`/solver/kuhn-verification` 读取同一份完整快照，重复及并发读取均不会重新运行 CFR。每个工作进程重启后重新计算；这不是对后续河牌任务的实时验证。
- Do not describe the finite river abstraction as a full-game GTO solver. / 不要把有限河牌抽象描述为完整牌局 GTO 求解器。

The Python engine remains an automatic runtime fallback if the compiled Rust extension cannot load. This preserves availability, while diagnostics and every experiment record continue to expose the selected engine.

若编译后的 Rust 扩展无法加载，系统会自动回退到 Python 引擎；健康诊断和每条实验记录仍会公开实际使用的引擎，从而兼顾可用性与可审查性。
