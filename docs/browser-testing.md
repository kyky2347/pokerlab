# Isolated browser verification / 隔离浏览器验收

Run the existing desktop and mobile journeys without stopping your development
stack or connecting tests to your experiment ledger:

无需停止开发服务，也不将测试连接到个人实验台账，即可运行现有桌面和移动端流程：

```bash
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

Use `playwright install --with-deps chromium` on Linux when browser system
libraries are missing. Node, pnpm, Python/uv and project dependencies still need
to be installed as described in [Contributing](../CONTRIBUTING.md).

Linux 缺少浏览器系统库时使用 `playwright install --with-deps chromium`。
Node、pnpm、Python/uv 及项目依赖仍需按[贡献指南](../CONTRIBUTING.md)安装。

Repository paths containing `?` are rejected because SQLite connection URLs
interpret it as a query delimiter; ordinary spaces in paths are supported.

仓库路径含 `?` 时拒绝启动，因为 SQLite 连接 URL 会将其解释为查询分隔符；
路径中的普通空格可以正常使用。

## What each run owns / 每次运行独立管理的资源

| Resource / 资源 | Isolation / 隔离方式 |
| --- | --- |
| Web/API listeners / 服务端口 | Two automatically selected loopback ports; no fixed 3000/8000 dependency. / 自动选择两个回环端口，不依赖固定 3000/8000。 |
| Database / 数据库 | A fresh SQLite file inside the run directory; overrides inherited `DATABASE_URL`. / 运行目录内的全新 SQLite 文件，覆盖继承的数据库地址。 |
| Browser API and CORS / 浏览器 API 与跨域来源 | Derived from the selected ports, overriding inherited URL settings. / 按本次端口生成，覆盖继承的 URL 设置。 |
| Frontend source/build / 前端源码与构建 | A snapshot of the current working tree's web source/config/assets, with its own `.next`, generated types and dev lock. / 当前工作区前端源码、配置及资源的快照，独立持有 `.next`、生成类型与开发锁。 |
| Reports / 报告 | Unique subdirectories under `apps/web/playwright-report/` and `apps/web/test-results/`. / 两个报告目录下按运行标识分别保存。 |

The runner copies an explicit source allowlist; it does not copy the web root's
`.env` files, existing build output or developer database. Installed Node packages
are linked, not reinstalled. The API uses the existing Python environment and
source checkout, with an explicit temporary database URL. Normal Rust selection
and automatic Python fallback are unchanged.

运行器只复制明确列出的源码目录/配置，不复制前端根目录的 `.env`、已有构建产物
或开发数据库。Node 依赖通过链接复用，不重复安装；API 使用已有 Python 环境
与源码，但数据库明确指向临时文件。Rust 选择与 Python 自动回退保持不变。

This is **test-data and generated-file isolation, not a security sandbox**.
Tests still execute repository code with your account's permissions. Do not run
untrusted repositories on a machine containing sensitive credentials.

这是**测试数据与生成文件隔离，不是安全沙箱**。测试仍以当前账户权限执行仓库
代码，不应在存有敏感凭据的机器上运行不可信仓库。

## Filtering and debugging / 筛选与调试

The normal Playwright test arguments are forwarded, except configuration
overrides. Always enter through the runner; invoking `playwright test` directly
without its session is rejected before starting services.

除覆盖配置文件外，常规 Playwright 测试参数会透传。始终通过运行器启动；缺少
运行会话时直接调用 `playwright test` 会在启动服务前被拒绝。

```bash
pnpm --filter web test:e2e --project=desktop-chromium
pnpm --filter web test:e2e --grep="small CFR" --headed
pnpm --filter web test:e2e --repeat-each=3
pnpm test:e2e-harness
```

The final command tests the harness itself: private snapshots, environment
overrides, malformed sessions, real occupied-port rejection, setup/spawn failures,
exit-code preservation and SIGINT/SIGTERM cleanup. It is included in `pnpm check`
and CI. The browser journeys still use real API calculations and cover both
languages, solver completion, navigation and mobile layout. Production image
HTTP checks remain a [separate deployment gate](deployment.md#dependency-runtime-checks--依赖运行时检查).

最后一条命令单独验证运行器，包括私有快照、环境覆盖、非法会话、真实端口占用
拒绝、初始化/进程启动失败、退出码保留及 SIGINT/SIGTERM 清理；已纳入
`pnpm check` 与 CI。浏览器流程仍使用真实 API 计算，覆盖双语、求解完成、导航
和移动端布局。生产镜像 HTTP 检查仍是独立部署门禁。

The default is two browser workers, matching the isolated API's two-solver
limit. Test processes explicitly use the standard 500,000 Monte Carlo sample,
5,000 solver iteration and two-solver limits, independent of a developer's
shell or `.env` settings. Increasing `--workers` may legitimately trigger 429
responses; repeat runs without raising worker count. Production limits are
not changed by this harness.

默认两个浏览器工作进程，与隔离 API 的两任务求解上限一致。测试明确使用标准的
500,000 次蒙特卡洛、5,000 轮求解及两任务并发限制，不受开发者终端或 `.env`
设置影响。提高 `--workers` 可能正常触发 429；重复验收时无需增加工作进程数。
本运行器不改变生产限制。

## Failure handling and retained evidence / 失败处理与证据保留

Ports are checked by Playwright with `reuseExistingServer: false`. If another
process claims a selected port before startup, the run fails; it never adopts
that service or stops it. Port discovery and binding are not one atomic operation,
so such a collision can require rerunning the command.

Playwright 使用 `reuseExistingServer: false` 检查端口。若其他进程在启动前
抢占所选端口，本次测试失败，不复用或停止对方服务。端口选择与绑定并非原子
操作，因此这种冲突可能需要重新运行命令。

On success, test failure, startup failure, or a handled SIGINT/SIGTERM, the runner
waits for the test process's teardown, then removes only its own freshly allocated
`.pokerlab-e2e-XXXXXX` directory. Reports, failure screenshots and traces remain in
the per-run report directories. Git and Docker build contexts exclude these test
artifacts. Browser reports can contain test inputs; share them deliberately.

成功、测试失败、启动失败或正常处理 SIGINT/SIGTERM 后，运行器等待测试进程
清理，再仅删除自己新建的 `.pokerlab-e2e-XXXXXX` 目录。报告、失败截图与轨迹
保留在对应运行的报告目录中；Git 与 Docker 构建上下文排除这些测试产物。
浏览器报告可能包含测试输入，请谨慎分享。

Both interruption signals are forwarded as SIGINT to Playwright so its task
runner can close all servers; the outer command still exits 130 for SIGINT and
143 for SIGTERM. A direct SIGKILL cannot use this teardown path.

两种中断信号都以 SIGINT 转交 Playwright，使其任务运行器关闭全部服务；外层命令
仍分别以 130（SIGINT）和 143（SIGTERM）退出。直接 SIGKILL 无法进入此清理流程。

SIGKILL, a host crash, or power loss cannot run cleanup handlers. A leftover run
directory may remain; verify that its processes have stopped and inspect the exact
directory before removing it. No broad or automatic stale-directory deletion is
performed. Windows signal semantics differ; the POSIX signal regressions run on
macOS/Linux and are skipped on Windows.

SIGKILL、主机崩溃或断电无法执行清理函数，可能留下运行目录；确认相关进程已
停止并核对具体目录后再清理。运行器不进行大范围或自动的历史目录删除。
Windows 信号语义不同；POSIX 信号回归在 macOS/Linux 执行，在 Windows 跳过。
