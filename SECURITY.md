# Security policy / 安全策略

## Supported version / 支持版本

Security fixes are applied to the latest `main` branch. PokerLab is local-first educational software and does not process payments or connect to gambling accounts.

安全修复面向最新 `main` 分支。PokerLab 是本地优先的教育软件，不处理支付，也不连接赌博账户。

## Reporting / 报告方式

Please do not publish an exploitable vulnerability in a public issue. Use GitHub’s private vulnerability reporting for this repository when available, or contact the repository owner privately through their GitHub profile.

请勿在公开 Issue 中披露可利用漏洞。优先使用本仓库的 GitHub 私密漏洞报告；若该入口不可用，请通过仓库所有者的 GitHub 主页进行私下联系。

Include the affected commit, reproduction steps, impact, and any suggested mitigation. Do not include real credentials, private poker data, or personal information.

请提供受影响提交、复现步骤、影响与建议修复方式；不要提交真实凭据、私人牌局数据或个人信息。

## Operational guidance / 运行建议

### Known dependency advisories / 已知依赖告警

Rechecked on **2026-10-28**: the October 24 development-toolchain pins remain undici
**8.12.2** and Zod **4.6.6**, retaining earlier Next.js, Vitest, Vite, native-image
and Python patches. Full/production npm audits and the Python package audit report
no known advisories. Python skips this repository's two local distributions;
these results do not audit every runtime, host or first-party code path.

**2026-10-28 复核**：保留 10 月 24 日锁定的开发工具链 undici **8.12.2**、Zod
**4.6.6**，以及此前 Next.js、Vitest、Vite、原生图像库与 Python 补丁。
完整/生产 npm 审计和 Python 包审计未报告已知告警；Python 跳过本仓库两个
本地项目包。这不等于审计了每个运行时、宿主机或本项目代码路径。

The previously disclosed [braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
was withdrawn by the advisory publisher on **2026-10-23**, with the stated reason
that it is not practically exploitable. The locked ESLint dependency remains
braces 3.0.3: PokerLab did **not** patch it, suppress it, or dismiss an alert to
obtain a clean audit. Earlier dated changelog entries describe the findings at
that time. Continue isolating untrusted development tooling and do not treat a
withdrawn advisory or clean feed as proof that software is vulnerability-free.

此前披露的上述 `braces` 告警由发布方于 **2026-10-23 撤回**，给出的理由是
不具实际可利用性。ESLint 工具链仍锁定 braces 3.0.3；本项目**没有**修复该包、
屏蔽告警或手动关闭告警来获得清洁审计。早期带日期的更新记录保留当时的发现。
仍应隔离不可信开发工具；告警撤回或审计清洁都不是“软件绝无漏洞”的证明。

### October 24 development dependencies / 10 月 24 日开发依赖

- jsdom's actual undici copy is **8.12.2**, covering [EventSource retained-state exhaustion](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685), [case-insensitive integrity verification](https://github.com/nodejs/undici/security/advisories/GHSA-f72v-6w45-q472), and [excessive content-encoding handling](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c). Tests use a network-disabled MockAgent to verify accepted matching digests and rejected mismatches for SHA-256/384/512 with lower, upper and mixed-case tokens. They do not launch a memory-exhaustion attack or emulate every upstream exploit.
- ESLint's React Hooks validator and `zod-validation-error` both resolve **Zod 4.6.6** for [oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Small fixtures verify `.max()` and `.length()` reject before element parsing while valid arrays still parse. [Upstream scope](https://github.com/colinhacks/zod/pull/6652): unbounded schemas remain unbounded.

- jsdom 实际加载的 undici 升至 **8.12.2**，修复上述 EventSource 保留状态耗尽、大小写不敏感完整性校验及过量内容编码处理问题。测试使用禁网 MockAgent 核对 SHA-256/384/512 三种算法及大小写变体的正确摘要接受与错误摘要拒绝，不执行内存耗尽攻击，也不模拟全部上游漏洞。
- ESLint 的 React Hooks 验证器及 `zod-validation-error` 均解析到 **Zod 4.6.6**。小型用例确认 `.max()`、`.length()` 在解析元素前拒绝超限数组，并保留合法数组行为；未设置长度约束的模式仍无界，详见上游补丁范围。

These are development dependencies, not new production services. The override
updates the locked npm copies only, **not Node.js's built-in fetch/undici or other
projects**. Keep Node.js, container images and independent installations patched
separately. A development-only classification is not a security guarantee.

这些是开发依赖，不是新增生产服务。覆盖规则仅更新本项目锁定的 npm 副本，
**不更新 Node.js 内置 fetch/undici 或其他项目**；Node.js、容器基础镜像和独立
安装需分别维护。“仅开发依赖”不代表没有安全风险。

The 2026-10-06 lockfile update pins affected `source-map-js` consumers to **1.2.2**, the patched release for [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (malformed indexed source-map section offsets). Frozen-lockfile installation is verified; this resolves that advisory, not the separate `braces` finding above.

2026-10-06 的锁文件更新将受影响的 `source-map-js` 依赖统一锁定到 **1.2.2**，修复上述“索引式 source map 非法分段偏移”告警，并验证冻结锁文件安装。该修复不包含前述独立的 `braces` 告警。

The 2026-10-07 lockfile update also patches:

- `shell-quote` **1.11.0**, reached through `concurrently`, for [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). The upstream command-injection condition requires a line terminator in a string after a comment token. PokerLab's development scripts use fixed repository commands; the advisory severity is not evidence of an exposed PokerLab command-execution endpoint.
- `sharp` **0.35.5**, reached through Next.js, including prebuilt **librsvg 2.63.2**, for [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The advisory describes runtime-dependent impact on glibc Linux; the shipped Alpine/musl image is still rebuilt and checked against the patched native library. Custom global libvips builds must also load patched librsvg.

2026-10-07 的锁文件还修复以下依赖：

- `concurrently` 引入的 `shell-quote` 升级至 **1.11.0**。上游命令注入条件是注释标记之后的字符串含换行符；PokerLab 开发脚本使用仓库中的固定命令，不能由公告严重级别推断项目存在已暴露的命令执行接口。
- Next.js 引入的 `sharp` 升级至 **0.35.5**，预编译依赖包含 **librsvg 2.63.2**。公告影响取决于 glibc Linux 的运行条件；本项目仍重新构建并检查 Alpine/musl 镜像里的补丁版本。使用全局自编译 libvips 时，也必须确保实际加载的 librsvg 已修复。

`pnpm test:dependencies` verifies the actual transitive copies and rejects unsafe shell-quoting cases without executing them. Native-image tests run in both the checkout and the final standalone container; they check loaded versions and actual PNG/WebP pixels. Version floors deliberately reject unknown/prerelease native versions. These are targeted regression guards, **not a comprehensive vulnerability scanner**. Rerun `pnpm audit` after dependency changes; no advisory is suppressed by these checks.

`pnpm test:dependencies` 验证实际间接依赖，对不安全的转义输入只检查拒绝行为，绝不执行它们。图像测试同时覆盖本地环境和最终独立部署容器，检查已加载版本与实际 PNG/WebP 像素。版本下限检查会主动拒绝未知或预发布原生版本。这些是定向回归保护，**并非完整漏洞扫描器**；依赖变更后仍应运行 `pnpm audit`，这些检查不会屏蔽告警。

The same update pins Alembic's transitive **Mako to 1.4.2** for [GHSA-5639-2j2p-m4mx](https://github.com/advisories/GHSA-5639-2j2p-m4mx), a Windows drive-letter template-URI traversal issue. PokerLab uses packaged migration templates, not user-controlled template paths. Regression tests check rejection under both POSIX and emulated Windows path semantics and render the actual migration template.

同一更新将 Alembic 的间接依赖 **Mako 锁定至 1.4.2**，修复上述 Windows 盘符模板 URI 目录遍历问题。PokerLab 使用随包分发的迁移模板，不接受用户控制的模板路径。回归测试覆盖 POSIX 与模拟 Windows 路径语义下的拒绝行为，并渲染实际迁移模板。

On 2026-10-07, `pip-audit` initially reported no known advisories while GitHub Dependabot identified Mako. We cross-checked the upstream advisory and patched it rather than trusting a single feed. The editable first-party `pokerlab-api` and `poker-core-rs` distributions are explicitly skipped by that Python audit; neither a clean feed nor these targeted guards establish that local code or every platform dependency is vulnerability-free.

2026-10-07，`pip-audit` 起初报告未发现已知漏洞，但 GitHub Dependabot 标出了 Mako。我们核对上游公告并修复，而非只相信单一数据源。可编辑安装的本项目 `pokerlab-api` 与 `poker-core-rs` 被该 Python 审计明确跳过；单个数据源的清洁结果或上述定向检查，均不意味着本地代码和所有平台依赖绝无漏洞。

### October 23 test-toolchain update / 10 月 23 日测试工具链更新

Vitest and its actual `@vitest/mocker` dependency are pinned to **4.1.12** for
[manual mock code injection](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)
and [Windows redirect traversal](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp).
These findings concern a reachable Vite mock-interceptor server, not the Next.js
production server. PokerLab uses local jsdom tests and does not expose that
interceptor as a product service. Runtime guards verify matching patched
Vitest/mocker versions; the full component suite exercises real mocking behavior.
Vite's separate 8.2.4 floor remains enforced. Do not expose development/test
servers to untrusted networks; this verification does not emulate Windows.

Vitest 与其实际 `@vitest/mocker` 依赖统一锁定至 **4.1.12**，修复手动 mock
代码注入与 Windows 重定向路径穿越两项告警。这些问题涉及可访问的 Vite mock
拦截服务，而非 Next.js 生产服务；本项目使用本地 jsdom 测试，不将该拦截器作为
产品服务公开。运行时保护核对 Vitest/mocker 补丁版本一致，完整组件测试覆盖实际
mock 行为，独立的 Vite 8.2.4 下限继续生效。不要将开发/测试服务暴露到不可信
网络；此验证不模拟 Windows 系统。

### October 20 toolchain updates / 10 月 20 日工具链更新

The lockfile updates Vite **8.2.2 → 8.2.4** for its bundled editor-launch code:

- [Windows percent escaping](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv).
- [Editor CLI flag interpretation](https://github.com/vitejs/launch-editor/security/advisories/GHSA-r825-w8mm-5pxw).
- [Windows path existence-check bypass](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm).

PokerLab reaches Vite through **Vitest and its mocker**, not its Next.js production server. These advisories have Windows/WSL and editor-specific preconditions; the lockfile finding is not evidence of an exposed PokerLab editor-launch endpoint. Runtime guards check both consumers' actual Vite resolution and transform a fixed TypeScript fixture without starting a server or editor. The guard deliberately stays on the patched 8.2 branch: an unqualified `>=8.2.4` check would incorrectly allow affected 8.3.0–8.3.2. This does not emulate Windows command execution or replace audits.

锁文件将 Vite 从 **8.2.2 升至 8.2.4**，修复随包编辑器启动代码的上述三项问题。PokerLab 通过 **Vitest 及其 mocker** 引入 Vite，而非 Next.js 生产服务；公告具有 Windows/WSL 和特定编辑器等前提，依赖告警不代表项目暴露了可利用的编辑器启动接口。回归检查两个消费者实际解析到的 Vite，并转换固定 TypeScript 示例，不启动服务器或编辑器。版本保护限定已修复的 8.2 分支，因为仅检查 `>=8.2.4` 会误放行受影响的 8.3.0–8.3.2；此验证不模拟 Windows 命令执行，也不替代审计。

The Python lockfile updates certifi **2026.7.22 → 2026.10.19** for [GHSA-6q48-6c7w-9gw2](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2), concerning compromised intermediate keys under the `emSign ECC Root CA - G3` trust root. In this project certifi is reached through the development HTTP client. Tests load the actual certifi bundle with OpenSSL, verify that root is absent, and keep certificate and hostname verification enabled. This updates the locked project environment, **not** the host/system CA store or unrelated Python environments. Custom deployments that vendor certifi must also update/rebuild their own copy; the normal API image excludes development dependencies.

Python 锁文件将 certifi 从 **2026.7.22 升至 2026.10.19**，处理上述 `emSign ECC Root CA - G3` 下中间证书私钥泄露的信任风险。本项目通过开发 HTTP 客户端引入 certifi。测试使用 OpenSSL 加载实际 certifi 证书库，核对受影响根证书已移除，并确认仍开启证书与主机名校验。此更新仅针对锁定的项目环境，**不修改**宿主机/系统信任库或其他 Python 环境；自行随包分发 certifi 的部署也需升级并重建对应副本，标准 API 镜像不安装开发依赖。

### Framework runtime update / 框架运行时更新

The 2026-10-23 update pins **Next.js and eslint-config-next to 16.4.1** for three
advisories added to the public advisory database on October 22:

- [SVG Image Optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): the upstream native-library issue has glibc/Linux prerequisites. PokerLab already pinned sharp 0.35.5 and checks loaded librsvg 2.63.2; the default container uses Alpine/musl. The framework upgrade also incorporates the upstream dependency floor.
- [Typed-array Cache Component RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): requires Cache Components and a `use cache` function returning multiple typed arrays. PokerLab does not enable Cache Components; the patched framework is still required.
- [Server Action CPU exhaustion](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): requires App Router with a Server Action. PokerLab currently has no Server Actions; its interactive calculations call the separate FastAPI service.

2026-10-23 将 **Next.js 与 eslint-config-next 升至 16.4.1**，处理 10 月 22 日
公共公告库新增的三项告警：SVG 图片优化的原生库问题具有 glibc/Linux 前提，项目
此前已锁定 sharp 0.35.5 并检查实际 librsvg 2.63.2，默认容器为 Alpine/musl；
类型化数组问题需要 Cache Components 及特定 `use cache` 返回值，项目未启用
该功能；CPU 耗尽问题需要 Server Action，项目目前不使用它，交互计算通过独立的
FastAPI 服务完成。这些边界不是跳过框架补丁的理由，也不是已遭攻击的证据。

Checkout tests verify the framework, ESLint configuration and plugin resolve to
the same patched stable version. Final-image tests inspect the built
configuration and action manifest: SVG/local-IP opt-ins and remote image hosts
remain disabled, Cache Components remain off, and Node/Edge Server Action maps
remain empty. If these product features are intentionally enabled later, review
and update the security boundary and its tests together. These checks do not
execute RCE payloads or claim exploit reproduction. Rebuild containers with
`./pokerlab start --no-open` (without `--no-build`) and restart development
servers; changing the lockfile alone cannot patch an already running process.

本地测试核对框架、ESLint 配置与插件实际解析到同一修复后的稳定版；最终镜像
测试检查构建配置与动作清单，确保仍未开放 SVG/本地 IP 图片或远程图片源，
Cache Components 保持关闭，Node/Edge Server Action 映射为空。将来有意启用
这些功能时，应同步复核安全边界与测试。这些检查不执行 RCE 载荷，也不宣称
复现了全部漏洞。请通过 `./pokerlab start --no-open` 重建容器（不加
`--no-build`），并重启开发服务；仅修改锁文件无法修复已运行的旧进程。

The 2026-10-10 update pins **Next.js and eslint-config-next to 16.3.8**. This patches six newly reported advisories in the prior 16.3.6 dependency; it does not mean every issue was reachable in PokerLab:

- [Image Optimization SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4): requires attacker-controlled allowlisted remote image hosts. PokerLab has no remote image allowlist.
- [Pages Router cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676) and [catch-all route cache poisoning](https://github.com/advisories/GHSA-mcj8-r9mp-w47p): PokerLab uses App Router with no root catch-all page.
- [Draft Mode cache disclosure](https://github.com/advisories/GHSA-3w37-wq28-93x7): PokerLab does not enable Cache Components or Draft Mode previews.
- [Metadata image disclosure](https://github.com/advisories/GHSA-f87g-xv8r-7p7x): PokerLab has no dynamic metadata image routes.
- [Development MCP disclosure](https://github.com/advisories/GHSA-39w2-rjm5-chcv): affects development servers, not production. Restart running development servers after installing the patch.

2026-10-10 将 **Next.js 与 eslint-config-next 锁定至 16.3.8**，修复旧版 16.3.6 新报告的六项告警；依赖受影响不等于本项目的所有路径都可利用。PokerLab 未配置远程图片白名单，使用 App Router 且没有根捕获全部路由，未启用 Cache Components 或草稿预览，也没有动态元数据图片路由。开发 MCP 告警只影响开发服务器，安装补丁后需重启正在运行的开发进程。

Container CI now starts the actual standalone server and verifies the loaded Next.js version, all nine product routes, their security headers, referenced JavaScript/CSS assets, 404 behavior, rejection of non-allowlisted remote images, and absence of the development MCP endpoint. Tests use only loopback inside a network-disabled, read-only container with no host ports. They do not reproduce every upstream exploit or replace browser tests, audits, or authenticated deployment controls. See [reproduction commands](docs/deployment.md#dependency-runtime-checks--依赖运行时检查).

容器 CI 现在会启动实际独立部署服务器，核对 Next.js 实际加载版本、九个产品路由及安全响应头、页面引用的 JavaScript/CSS、404 行为、非白名单远程图片拒绝，以及生产环境不提供开发 MCP 端点。测试仅使用禁网、只读容器内的回环网络，不发布宿主机端口。这些检查并未复现全部上游漏洞，也不能替代浏览器测试、漏洞审计或部署认证；复现命令见上述部署文档。

### Deployment / 部署

- The default Compose deployment publishes web/API only on `127.0.0.1`. Use Docker Engine 28.0.0+; [older engines have a localhost-publishing limitation](https://docs.docker.com/engine/network/port-publishing/). Custom ports retain this binding.
- There is no built-in user authentication or per-user data isolation. Never expose the API directly to untrusted networks; use an authenticated HTTPS gateway with authorization for all routes. CORS is not authentication. Loopback binding does not protect against other users/processes on the same host.
- Keep `CORS_ORIGINS` restricted to trusted frontend origins.
- Do not expose SQLite on shared multi-process deployments; use PostgreSQL.
- Keep Monte Carlo, solver iteration, and solver concurrency limits enabled.
- Never put database credentials in `NEXT_PUBLIC_*` variables.
- Treat exported experiments as potentially sensitive if they contain private research inputs.

- 默认 Compose 部署仅向 `127.0.0.1` 发布 Web/API 端口，自定义端口也保持该绑定。请使用 Docker Engine 28.0.0+；[旧版存在 localhost 端口发布限制](https://docs.docker.com/engine/network/port-publishing/)。
- 没有内置用户认证或用户间数据隔离。不要把 API 直接暴露到不可信网络；应使用带身份认证的 HTTPS 网关，并为全部路由配置授权。CORS 不是身份认证；回环绑定也不能防范同一主机上的其他用户或进程。
- 将 `CORS_ORIGINS` 限制为可信前端来源。
- 共享或多进程部署应使用 PostgreSQL，不要直接暴露 SQLite。
- 保持蒙特卡洛、求解器迭代与并发限制开启。
- 不要把数据库凭据放入 `NEXT_PUBLIC_*` 变量。
- 若实验导出包含私人研究输入，应按敏感数据处理。
