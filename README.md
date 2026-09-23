<div align="center">

# PokerLab

### Probability. Strategy. Uncertainty.

**A local-first research instrument for Hold’em probability, reproducible simulation, decision theory, and finite game solving.**<br>
**一个本地优先的德州扑克概率、可复现模拟、决策理论与有限博弈研究工具。**

[![Quality](https://github.com/kyky2347/pokerlab/actions/workflows/ci.yml/badge.svg)](https://github.com/kyky2347/pokerlab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-bfa06a.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-58a982.svg)](apps/api/pyproject.toml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-111816.svg)](apps/web/package.json)
[![Rust 1.88](https://img.shields.io/badge/Rust-1.88-d95b52.svg)](rust-toolchain.toml)

[Quick start / 快速开始](#quick-start--快速开始) · [Architecture / 架构](#architecture--架构) · [Validation / 验证](#validation--验证) · [Download ZIP](https://github.com/kyky2347/pokerlab/archive/refs/heads/main.zip)

</div>

![PokerLab overview](output/playwright/home.png)

## What makes PokerLab different / 为什么是 PokerLab

PokerLab is designed as an inspectable research system—not a casino skin and not a collection of disconnected calculators. The browser never invents canonical poker results: every displayed equity, confidence interval, strategy, and experiment record comes from the typed API and the tested poker core.

PokerLab 是一套可审查的研究系统，而不是赌场风格外壳或互不关联的小工具集合。浏览器不会自行生成“官方结果”；界面中的胜率、置信区间、策略和实验记录均来自类型化 API 与经过测试的扑克核心。

- **One source of mathematical truth / 单一数学真值源** — Python reference evaluator plus a cross-checked Rust/PyO3 accelerator.
- **Reproducible by construction / 从设计上可复现** — stochastic runs store their seed, parameters, engine, runtime, and result.
- **Durable training / 可持续训练** — issued questions survive API restarts for 24 hours, with atomic one-time scoring across workers and data-preserving database upgrades. / 已出题目在 24 小时有效期内可跨 API 重启提交；多进程评分具备原子去重，数据库升级保留已有记录。
- **Real finite solving / 真实有限求解** — CFR+ is implemented in this repository and verified against Kuhn Poker; no third-party solver is used.
- **Honest limits / 坦诚展示边界** — the river solver’s no-raise abstraction is visible in the UI and documentation.
- **Auditable policy comparisons / 可核验策略比较** — named fixed policies, editable seeds, approximate mean-EV intervals, and versioned JSON/CSV exports. This synthetic benchmark does not train CFR agents or measure real poker winnings. / 明确的固定策略、可编辑种子、平均 EV 近似区间与带方法版本的 JSON/CSV 导出；此合成基准不训练 CFR 代理，也不衡量实际扑克盈利。详见 [research methods / 研究方法](docs/research-methods.md)。
- **Local-first / 本地优先** — SQLite works out of the box; PostgreSQL and Docker Compose are supported without making cloud accounts mandatory.
- **English and Chinese / 中英双语** — the product shell, primary workflows, safety copy, and documentation are available in both languages.

## Product tour / 功能导览

| Instrument / 工具                    | What it does / 功能                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Equity Lab / 胜率实验室**          | Exact legal-runout enumeration, seeded Monte Carlo, variance, standard error, 95% confidence intervals, and a conditional turn map. / 精确枚举、固定种子蒙特卡洛、方差、标准误、95% 置信区间与条件转牌地图。 |
| **Range Lab / 范围实验室**           | A weighted 13×13 range matrix, physical blockers, combo accounting, and range-vs-range equity. / 13×13 加权范围矩阵、物理阻断牌、组合统计与范围对范围胜率。                                                  |
| **Guess the Equity / 猜胜率**        | Legal scenarios, continuous quadratic scoring, and an interpretable weakness-weighted sampler. / 合法牌局、连续二次评分与可解释的薄弱项加权出题。                                                            |
| **EV Lab / EV 实验室**               | Explicit pot conventions, break-even equity, incremental call EV, and decision curves. / 明确的底池约定、盈亏平衡胜率、增量跟注 EV 与决策曲线。                                                              |
| **CFR Solver Lite / CFR 轻量求解器** | A real blocker-aware CFR+ river abstraction with mixed strategies and convergence diagnostics. / 真实运行、阻断牌感知的河牌 CFR+ 抽象、混合策略与收敛诊断。                                                  |
| **Research / AI / 研究实验室**       | Beta–Binomial inference, seeded convergence exports, and transparent agent comparisons. / Beta–Binomial 推断、固定种子收敛导出与透明代理对比。                                                               |
| **Experiment ledger / 实验台账**     | SQLite/PostgreSQL persistence with complete JSON and CSV export. / SQLite/PostgreSQL 持久化及完整 JSON、CSV 导出。                                                                                           |

<details>
<summary><strong>Open the visual gallery / 展开界面画廊</strong></summary>

### Equity and ranges / 胜率与范围

![Equity Lab](output/playwright/equity-lab.png)

![Range Lab](output/playwright/range-lab.png)

### Training and decision theory / 训练与决策理论

![Guess the Equity](output/playwright/trainer.png)

![EV Lab](output/playwright/ev-lab.png)

### Game theory and research / 博弈论与研究

![CFR Solver Lite](output/playwright/solver.png)

![Research Lab](output/playwright/research-lab.png)

![Reproducible policy comparison: seed 7, 1,000 synthetic decisions](output/playwright/research-agents.png)

Research comparison: real API output, seed `7`, 1,000 synthetic decisions. See [methods and interpretation](docs/research-methods.md). / 策略比较截图来自真实 API 输出：种子 `7`、1,000 次合成决策；详见[研究方法与解读](docs/research-methods.md)。

### Mobile Chinese interface / 移动端中文界面

![PokerLab mobile Chinese](output/playwright/mobile-home-zh.png)

</details>

## Quick start / 快速开始

### One command: launch the complete system / 一条命令启动完整系统

Install and start Docker Desktop, then run the repository launcher from the project directory:

安装并启动 Docker Desktop，然后在项目目录执行仓库启动器：

```bash
./pokerlab
```

That single command generates a private local database credential, builds and starts PostgreSQL, the Rust-accelerated API, and the production web app, waits for every health check, then opens PokerLab in the default browser.

这一条命令会生成仅保存在本机的随机数据库凭据，构建并启动 PostgreSQL、Rust 加速 API 与生产 Web 应用，等待全部健康检查通过，然后在默认浏览器中打开 PokerLab。

```bash
./pokerlab status          # service health / 服务状态
./pokerlab logs            # live logs / 实时日志
./pokerlab stop            # stop and preserve data / 停止并保留数据
./pokerlab start --no-open # headless start / 启动但不打开浏览器
./pokerlab start --no-build --no-open # reuse images / 复用已有镜像
```

`--no-build` is for unchanged code with images already built. After pulling updates, run `./pokerlab` normally to rebuild. Keep a private backup of `.pokerlab.env`: if it is lost while the database volume remains, restore the original credentials; the launcher will not replace them or erase data.

`--no-build` 用于代码未变且镜像已构建的情况；拉取更新后请正常运行 `./pokerlab` 以重新构建。请私密备份 `.pokerlab.env`：若配置丢失但数据库卷仍在，请恢复原凭据；启动器不会擅自更换密码或删除数据。

### Native development / 本地开发

Prerequisites / 环境要求:

- Node.js 24+
- pnpm 11+
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Rust 1.88+ for the accelerator; the API preserves an automatic Python fallback if the compiled extension cannot load. / Rust 用于加速器；若扩展运行时无法加载，API 会自动回退到 Python 参考实现。

```bash
git clone https://github.com/kyky2347/pokerlab.git
cd pokerlab
corepack enable
make setup
make dev
```

Open / 打开:

- Product UI / 产品界面: <http://localhost:3000>
- API health / API 健康检查: <http://localhost:8000/health>
- Interactive OpenAPI / 交互式 API 文档: <http://localhost:8000/docs>

### Manual container control / 手动控制容器

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD in .env with a random local value.
# 将 .env 中的 POSTGRES_PASSWORD 替换为随机本地值。
docker compose --env-file .env up --build
```

The `./pokerlab` launcher is recommended because it creates the ignored runtime credential securely, waits for health checks, and opens the product automatically. For manual Compose control, stop with `docker compose --env-file .env down`; add `-v` only when you intentionally want to remove the database volume.

推荐使用 `./pokerlab`，因为它会安全生成被 Git 忽略的运行凭据、等待健康检查并自动打开产品。手动使用 Compose 时，以 `docker compose --env-file .env down` 停止；只有明确需要删除数据库卷时才追加 `-v`。

## Architecture / 架构

```mermaid
flowchart LR
  UI[Next.js 16 + React 19\nBilingual research UI] -->|typed JSON REST| API[FastAPI + Pydantic\nvalidation + safety limits]
  API --> ENGINE{PokerEngine}
  ENGINE -->|preferred| RUST[Rust + PyO3\n7-card evaluator]
  ENGINE -->|automatic fallback| PY[Python reference\nexact + Monte Carlo]
  API --> CFR[From-scratch CFR+\nKuhn verification]
  API --> SCI[NumPy + SciPy\nreproducible research]
  API --> DB[(SQLAlchemy\nSQLite / PostgreSQL)]
```

The API is the canonical result source. The frontend owns interaction and visualization, but never calculates canonical equity. Rust and Python evaluator outputs are cross-checked on seeded seven-card samples. See [architecture](docs/architecture.md), [mathematical notes](docs/math), and [solver limitations](docs/solver-limitations.md).

API 是结果真值源；前端负责交互与可视化，但不计算权威胜率。Rust 与 Python 评估器会在固定随机样本上交叉验证。详见[架构说明](docs/architecture.md)、[数学说明](docs/math)与[求解器边界](docs/solver-limitations.md)。

Database schemas now upgrade automatically at API startup. Existing experiment, training-answer, and solver records are preserved; PostgreSQL stores every API-accepted seed (`0` through `2^63 - 1`) in a 64-bit column. If the configured database cannot be initialized, startup stops instead of silently sending new records to another database. Back up before upgrading; see [deployment and recovery](docs/deployment.md#database-upgrades-and-recovery--数据库升级与恢复).

数据库结构会在 API 启动时自动升级，保留现有实验、训练成绩与求解记录；PostgreSQL 使用 64 位字段存储 API 接受的全部种子（`0` 至 `2^63 - 1`）。指定数据库无法初始化时会停止启动，不再悄悄把新记录写入另一份数据库。升级前请备份，详见[部署与恢复](docs/deployment.md#database-upgrades-and-recovery--数据库升级与恢复)。

## Mathematical contract / 数学契约

- Equity / 胜率: `E = P(win) + 0.5 × P(tie)`
- Monte Carlo / 蒙特卡洛: `Êₙ = (1/n) ΣXᵢ`, where `Xᵢ ∈ {0, 0.5, 1}`
- Call EV / 跟注 EV: `EV(call) = e(P + B + C) − C`
- Bayesian update / 贝叶斯更新: `Beta(α, β) → Beta(α+s, β+f)`
- CFR+ regret matching / CFR+ 遗憾匹配: `σ(a) ∝ max(R(a), 0)`

Duplicate cards are rejected at the domain boundary. Monte Carlo samples legal runouts without replacement inside each trial. Range equity removes blocker collisions before normalization. / 重复牌会在领域边界被拒绝；蒙特卡洛在每次试验内进行无放回合法补牌采样；范围胜率会在归一化前移除阻断冲突。

## Validation / 验证

Run the complete local quality gate / 运行完整本地质量门禁:

```bash
make check
pnpm --filter web test:e2e
```

The suite covers evaluator ordering, wheel straights, duplicate rejection, exact-equity symmetry, deterministic seeds, Monte Carlo statistical tolerance, weighted blockers, canonical range aliases, Rust/Python cross-checks, EV geometry, CFR strategy normalization, Kuhn convergence, structured API errors, component behavior, desktop workflows, and mobile overflow. Launcher regression tests cover concurrent credential initialization, private permissions, non-destructive error handling, and image reuse; API tests use isolated temporary databases.

测试覆盖牌力排序、A2345 顺子、重复牌拒绝、精确胜率对称性、固定种子、蒙特卡洛统计容差、加权阻断、范围别名、Rust/Python 交叉验证、EV 几何、CFR 策略归一化、Kuhn 收敛、结构化 API 错误、组件交互、桌面流程与移动端溢出。启动器回归测试覆盖并发凭据初始化、私有权限、无破坏性报错与镜像复用；API 测试使用隔离的临时数据库。

GitHub Actions runs formatting, linting, type checks, Python/Rust/frontend tests, production builds, desktop/mobile browser tests, and both container builds on every push and pull request.

Storage tests run against both SQLite and a disposable PostgreSQL service in CI, covering legacy migrations, 64-bit seeds, rollback, concurrent workers, and restart-safe training. / CI 同时在 SQLite 与临时 PostgreSQL 服务上验证存储行为，覆盖旧库迁移、64 位种子、回滚、并发进程及训练题跨重启提交。

Research regressions check policy thresholds, historical seeded values, an independent uncertainty calculation, saved methodology, exact browser seed validation, and metadata-rich CSV escaping. / 研究回归测试覆盖策略阈值、历史固定种子结果、独立误差公式复核、方法持久化、浏览器种子精度校验与携带完整参数的 CSV 转义。

Turn-map regressions compare every legal turn with independent exact enumeration, verify split pots and player-swap symmetry, and cross-check Rust against Python. Both engines reject duplicate cards across players at the showdown boundary. / 转牌地图回归测试逐张对照独立精确枚举，验证平局、双方交换对称性及 Rust/Python 一致性；两个引擎均在摊牌入口拒绝双方持有重复牌的非法状态。

Solver regressions compare full cached/uncached strategies and convergence traces on both engines. Real SQLite/PostgreSQL constraint failures verify rollback, original-error preservation, job status, and concurrency-slot release. / 求解回归测试在双引擎下对照缓存与未缓存的完整策略和收敛轨迹；通过真实 SQLite/PostgreSQL 约束错误验证回滚、原始异常保留、任务状态及并发名额释放。

## Measured benchmark / 实测基准

These are reproducible observations from `pnpm benchmark`, not universal performance claims. Recorded on macOS ARM with Python 3.12 using the Python reference path:

| Workload / 工作负载                             |    Observed / 实测 |
| ----------------------------------------------- | -----------------: |
| Seven-card evaluation / 七张牌评估              |      22,317 eval/s |
| Exact flop scenario, 990 runouts / 翻牌精确场景 |  10.95 scenarios/s |
| Monte Carlo / 蒙特卡洛                          |   10,561 samples/s |
| One-class river range equity / 单类河牌范围胜率 | 145.97 scenarios/s |
| CFR one-class iteration / 单类 CFR 迭代         | 34.10 iterations/s |

Methodology and caveats / 方法与限制: [research/benchmarks.md](research/benchmarks.md)

Weighted range sampling now builds its cumulative probability table once per request. In a separate 20-class, 5,000-sample benchmark on the same machine, median end-to-end time fell from 1,217 to 505 ms on Python and from 822 to 120 ms with Rust. The seeded result is unchanged. These are workload-specific measurements, not a promise for every calculation.

加权范围采样现在每次请求只构建一次累计概率表。在同机独立测试的 20 类手牌、5,000 次采样场景中，Python 路径耗时中位数从 1,217 降至 505 毫秒，Rust 路径从 822 降至 120 毫秒，固定种子结果不变。这是特定工作负载的实测，不代表所有计算都具有同样增益。

Reproduce / 复现：`cd apps/api && uv run python -m pokerlab_api.benchmarks --range-only`

The exact turn map now shares unordered runouts: 990 showdown evaluations instead of 1,980, with all 45 conditional equities unchanged. A five-repeat local algorithm comparison measured median times of **204 → 104 ms (Python)** and **41 → 20 ms (Rust)**. Both compared algorithms use the same current evaluator and validation; these are turn-map measurements, not whole-app speedups. See the [derivation / 数学推导](docs/math/equity.md#conditional-turn-map--条件转牌地图) and [benchmark record / 实测记录](research/benchmarks.md).

精确转牌地图现在复用无序补牌组合，将摊牌评估从 1,980 次减少到 990 次，全部 45 张转牌的条件胜率保持不变。同机五次算法对照实测耗时中位数为 **Python 204 → 104 毫秒、Rust 41 → 20 毫秒**。两种算法使用相同的当前评估器和校验逻辑；该结果仅代表转牌地图，不是整个应用的加速比。

Reproduce / 复现：`cd apps/api && uv run python -m pokerlab_api.benchmarks --turn-map-only`

River CFR now reuses each fixed deal's actual showdown outcome within its job. In a 61-deal, 100-iteration local benchmark, evaluations fell from **30,500 to 61**, with unchanged strategies and convergence. Median time was **3,270 → 113 ms on Python (29.01×)** and **743 → 103 ms on Rust (7.19×)**. These ratios describe this workload only; the finite game tree and [solver limitations](docs/solver-limitations.md) are unchanged.

河牌 CFR 现在在任务内复用每组固定牌面的真实摊牌结果。在 61 组手牌对、100 轮的本地基准中，评估次数由 **30,500 减至 61**，策略与收敛轨迹不变。耗时中位数为 **Python 3,270 → 113 毫秒（29.01×）、Rust 743 → 103 毫秒（7.19×）**。这些比率仅适用于该工作负载，有限博弈树和[求解器限制](docs/solver-limitations.md)保持不变。

Reproduce / 复现：`cd apps/api && uv run python -m pokerlab_api.benchmarks --solver-only`

## Repository map / 仓库结构

```text
apps/web/                 Next.js product UI and browser tests
apps/api/                 FastAPI, reference engine, CFR, research, persistence
packages/poker-core/      Rust evaluator and PyO3 extension
docs/math/                Inspectable mathematical definitions
research/                 Measured benchmark record
infra/                    Reproducible container builds
.github/workflows/        Continuous quality gates
```

## Scope and responsible use / 范围与负责任使用

The solver is heads-up, river-only, fixed-board, fixed-range, and no-raise. Its displayed regret is a convergence diagnostic—not rigorous exploitability. PokerLab does not implement payments, deposits, casino integration, screen capture, real-time play advice, or automated betting.

求解器仅覆盖单挑、河牌、固定公共牌、固定范围与无加注树；显示的遗憾值是收敛诊断，不是严格 exploitability。本项目不实现支付、存款、赌场接入、屏幕抓取、实时牌局建议或自动下注。

## Contributing and security / 贡献与安全

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing mathematical or behavioral changes. Report vulnerabilities according to [SECURITY.md](SECURITY.md). Released under the [MIT License](LICENSE).

提交数学或行为变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请按 [SECURITY.md](SECURITY.md) 报告。本项目使用 [MIT License](LICENSE)。
