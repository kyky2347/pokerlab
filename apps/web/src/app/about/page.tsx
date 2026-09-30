"use client";

import {
  ArrowUpRight,
  BookOpen,
  Database,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/lab-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { API_URL } from "@/lib/api";
import { useCopy } from "@/lib/store";

export default function About() {
  const zh = useCopy(false, true);
  const sections = [
    {
      title: zh ? "胜率" : "Equity",
      equation: "E = P(win) + ½P(tie)",
      text: zh
        ? "当状态空间可控时枚举所有合法补牌；否则使用独立蒙特卡洛。"
        : "Enumerate every legal runout when practical; otherwise use independent Monte Carlo.",
    },
    {
      id: "monte-carlo",
      title: zh ? "蒙特卡洛" : "Monte Carlo",
      equation: "rₙ = √(ln 40 / 2n), CI = [Êₙ ± rₙ] ∩ [0,1]",
      text: zh
        ? "对独立同分布的 {0, ½, 1} 胜率得分，Hoeffding 区间在预先固定样本量时具有至少 95% 的重复抽样覆盖率。区间较保守，不是整条轨迹的同时置信带，不支持看结果后提前停止。估计标准误 s/√n 在 n=1 时未定义，样本标准误为零也不证明真实误差为零。"
        : "For independent, identically distributed equity scores in {0, ½, 1}, the conservative Hoeffding interval has at least 95% repeated-sampling coverage at a prespecified sample count. It is not a simultaneous band and does not justify stopping after inspecting results. Estimated SE s/√n is undefined at n=1; zero sample SE does not prove zero error.",
    },
    {
      title: zh ? "贝叶斯更新" : "Bayesian update",
      equation: "Beta(α,β) → Beta(α+s, β+f)",
      text: zh
        ? "完整后验分布保留小样本不确定性。"
        : "The full posterior preserves small-sample uncertainty.",
    },
    {
      title: zh ? "跟注 EV" : "Call EV",
      equation: "EV = e(P+B+C) − C",
      text: zh
        ? "只衡量当前决策的增量价值；此前投入视为沉没成本。"
        : "Measures incremental value only; earlier contributions are sunk.",
    },
    {
      title: "CFR+",
      equation: "σ(a) ∝ R⁺(a)",
      text: zh
        ? "对每个信息集进行遗憾匹配；累计遗憾截断为非负。"
        : "Regret matching at each information set with cumulative regrets clipped nonnegative.",
    },
  ];
  return (
    <div>
      <PageHeader
        title={zh ? "方法、架构与边界" : "Methods, architecture & limits"}
        description={
          zh
            ? "PokerLab 是教育与研究软件，不用于真钱赌博、实时牌局建议或自动下注。"
            : "PokerLab is educational research software. It is not for real-money gambling, live-game advice, or automated betting."
        }
        badge="MATHEMATICALLY TRANSPARENT"
      />
      <Alert className="mb-5">
        <ShieldCheck />
        <AlertTitle>
          {zh ? "引擎选择透明" : "Transparent engine selection"}
        </AlertTitle>
        <AlertDescription>
          {zh
            ? "启动时优先加载 Rust/PyO3；不可用时自动使用经过同一不变量测试的 Python 参考实现。诊断接口会明确报告当前引擎。"
            : "Startup prefers Rust/PyO3 and automatically falls back to the Python reference tested against the same invariants. Diagnostics reports the active engine explicitly."}
        </AlertDescription>
      </Alert>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <BookOpen className="text-primary" />
            <CardTitle>
              {zh ? "数学基础" : "Mathematical foundations"}
            </CardTitle>
            <CardDescription>
              {zh
                ? "界面中的数字对应以下定义。"
                : "Numbers in the interface map to these definitions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0">
            {sections.map((section, index) => (
              <div key={section.title} id={section.id} className="scroll-mt-20">
                {index ? <Separator /> : null}
                <div className="grid gap-3 py-5 md:grid-cols-[160px_minmax(0,1fr)]">
                  <h3 className="font-semibold">{section.title}</h3>
                  <div className="flex min-w-0 flex-col gap-3">
                    <code className="font-data text-sm break-words text-primary">
                      {section.equation}
                    </code>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {section.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <GitBranch className="text-primary" />
              <CardTitle>{zh ? "有限河牌树" : "Finite river tree"}</CardTitle>
              <CardDescription>
                Heads-up · fixed board · weighted ranges
              </CardDescription>
            </CardHeader>
            <CardContent className="font-data flex flex-col gap-3 text-xs">
              <div className="rounded-lg bg-muted p-3">
                OOP → CHECK / BET ½P / BET 1P
              </div>
              <div className="ml-5 rounded-lg bg-muted p-3">
                after CHECK: IP → CHECK / BET ½P / BET 1P
              </div>
              <div className="ml-10 rounded-lg bg-muted p-3">
                facing BET → FOLD / CALL
              </div>
              <Badge variant="destructive" className="w-fit">
                NO RAISES
              </Badge>
              <p className="font-sans leading-5 text-muted-foreground">
                {zh
                  ? "策略收敛只适用于这一抽象，不证明完整无限注德州扑克中的 GTO。"
                  : "Convergence applies only to this abstraction and does not establish full no-limit Hold’em GTO."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Database className="text-primary" />
              <CardTitle>
                {zh ? "本地优先持久化" : "Local-first persistence"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              <p>
                {zh
                  ? "默认 SQLite；可通过 DATABASE_URL 切换到 PostgreSQL。核心流程不需要云账户。"
                  : "SQLite by default; switch to PostgreSQL with DATABASE_URL. Core flows require no cloud account."}
              </p>
              <a
                href={`${API_URL}/docs`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                OpenAPI documentation <ArrowUpRight />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
