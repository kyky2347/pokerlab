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

As of **2026-10-07**, `pnpm audit` reports [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested brace patterns can exhaust the stack in `braces <=3.0.3`. In this lockfile it is reached through the **ESLint development toolchain** (`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`). The public advisory lists no patched release, and the npm registry still lists 3.0.3 as latest. Although the audit output suggests `>=3.0.4`, that version was not available at verification time.

截至 **2026-10-07**，`pnpm audit` 报告上述高危告警：`braces <=3.0.3` 处理深层嵌套模式时可能耗尽调用栈。本锁文件中的依赖路径来自 **ESLint 开发工具链**（路径如上）。官方公告尚无修复版，npm 最新版仍为 3.0.3；审计输出虽然提示 `>=3.0.4`，但核实时该版本并不存在。

This advisory is **not suppressed or marked fixed**. Avoid supplying untrusted patterns to this tooling and run untrusted-repository checks in isolated, resource-limited CI workers. The app does not directly import this package, but a development-only dependency classification is not a guarantee of safety. Recheck the registry/advisory before upgrading and rerun the quality gate once a supported patch is published. Existing loopback deployment and repository protections remain in effect.

本项目**没有屏蔽告警，也不宣称已修复**。不要向此工具链传入不可信模式；检查不可信仓库时应使用隔离、受资源限制的 CI。应用未直接导入此包，但“仅开发依赖”并不代表没有风险。升级前应重新核实公告和注册表，正式补丁发布后再升级并重跑质量门禁。现有回环部署与仓库保护继续生效。

The 2026-10-06 lockfile update pins affected `source-map-js` consumers to **1.2.2**, the patched release for [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (malformed indexed source-map section offsets). Frozen-lockfile installation is verified; this resolves that advisory, not the separate `braces` finding above.

2026-10-06 的锁文件更新将受影响的 `source-map-js` 依赖统一锁定到 **1.2.2**，修复上述“索引式 source map 非法分段偏移”告警，并验证冻结锁文件安装。该修复不包含前述独立的 `braces` 告警。

The 2026-10-07 lockfile update also patches:

- `shell-quote` **1.11.0**, reached through `concurrently`, for [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). The upstream command-injection condition requires a line terminator in a string after a comment token. PokerLab's development scripts use fixed repository commands; the advisory severity is not evidence of an exposed PokerLab command-execution endpoint.
- `sharp` **0.35.5**, reached through Next.js, including prebuilt **librsvg 2.63.2**, for [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The advisory describes runtime-dependent impact on glibc Linux; the shipped Alpine/musl image is still rebuilt and checked against the patched native library. Custom global libvips builds must also load patched librsvg.

2026-10-07 的锁文件还修复以下依赖：

- `concurrently` 引入的 `shell-quote` 升级至 **1.11.0**。上游命令注入条件是注释标记之后的字符串含换行符；PokerLab 开发脚本使用仓库中的固定命令，不能由公告严重级别推断项目存在已暴露的命令执行接口。
- Next.js 引入的 `sharp` 升级至 **0.35.5**，预编译依赖包含 **librsvg 2.63.2**。公告影响取决于 glibc Linux 的运行条件；本项目仍重新构建并检查 Alpine/musl 镜像里的补丁版本。使用全局自编译 libvips 时，也必须确保实际加载的 librsvg 已修复。

`pnpm test:dependencies` verifies the actual transitive copies and rejects unsafe shell-quoting cases without executing them. Native-image tests run in both the checkout and the final standalone container; they check loaded versions and actual PNG/WebP pixels. Version floors deliberately reject unknown/prerelease native versions. These are targeted regression guards, **not a comprehensive vulnerability scanner**. Rerun `pnpm audit` after dependency changes; the remaining braces warning is not suppressed.

`pnpm test:dependencies` 验证实际间接依赖，对不安全的转义输入只检查拒绝行为，绝不执行它们。图像测试同时覆盖本地环境和最终独立部署容器，检查已加载版本与实际 PNG/WebP 像素。版本下限检查会主动拒绝未知或预发布原生版本。这些是定向回归保护，**并非完整漏洞扫描器**；依赖变更后仍应运行 `pnpm audit`，现存 braces 告警不屏蔽。

On 2026-10-07, `pip-audit` found no known advisories in the installed Python third-party environment. The editable first-party `pokerlab-api` and `poker-core-rs` distributions were explicitly skipped; this is not a claim that local code or every possible platform dependency is vulnerability-free.

2026-10-07，`pip-audit` 在已安装的 Python 第三方环境中未发现已知漏洞。可编辑安装的本项目 `pokerlab-api` 与 `poker-core-rs` 被明确跳过；这不表示本地代码或所有平台上的依赖都不存在漏洞。

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
