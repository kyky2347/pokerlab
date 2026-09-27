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
