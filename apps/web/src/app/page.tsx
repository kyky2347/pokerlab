"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  FlaskConical,
  Gauge,
  Grid3X3,
  Sigma,
} from "lucide-react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PokerTable } from "@/components/poker-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import type { EquityResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const modules = [
  {
    href: "/equity",
    icon: ChartNoAxesCombined,
    title: "Equity Lab",
    zh: "胜率实验室",
    desc: "Exact enumeration, seeded simulation, and conditional turn maps.",
    zhDesc: "精确枚举、固定随机种子模拟与条件转牌地图。",
  },
  {
    href: "/range",
    icon: Grid3X3,
    title: "Range Lab",
    zh: "范围实验室",
    desc: "Weighted starting-hand ranges with physical blockers.",
    zhDesc: "带物理阻断牌修正的加权起手牌范围。",
  },
  {
    href: "/trainer",
    icon: Gauge,
    title: "Guess the Equity",
    zh: "猜胜率",
    desc: "A continuous-score trainer that adapts to weak categories.",
    zhDesc: "连续评分并针对薄弱类别自适应出题的训练器。",
  },
  {
    href: "/ev",
    icon: Sigma,
    title: "EV Lab",
    zh: "EV 实验室",
    desc: "Pot odds, call EV, and a visible break-even boundary.",
    zhDesc: "底池赔率、跟注 EV 与可视化盈亏平衡边界。",
  },
  {
    href: "/solver",
    icon: BrainCircuit,
    title: "CFR Solver Lite",
    zh: "CFR 轻量求解器",
    desc: "A real, finite, no-raise river CFR+ abstraction.",
    zhDesc: "真实运行的有限、无加注河牌 CFR+ 抽象。",
  },
  {
    href: "/research",
    icon: FlaskConical,
    title: "Research / AI",
    zh: "研究 / AI",
    desc: "Bayesian updates, agent batches, and reproducible experiments.",
    zhDesc: "贝叶斯更新、智能体批量对比与可复现实验。",
  },
];

function ConvergencePreview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["home-convergence"],
    queryFn: () =>
      postJson<EquityResult>("/research/monte-carlo", {
        hero: ["As", "Ks"],
        villain: ["Qh", "Qd"],
        board: ["Js", "8s", "2c"],
        samples: 1500,
        seed: 20250902,
      }),
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError || !data?.convergence)
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Start the API to load a real seeded simulation.
      </div>
    );
  return (
    <div className="h-40 w-full" aria-label="Monte Carlo convergence preview">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data.convergence}
          margin={{ top: 8, right: 4, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="homeArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="samples"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0.3, 0.7]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`}
          />
          <ReferenceLine
            y={data.equity}
            stroke="var(--chart-2)"
            strokeDasharray="4 4"
          />
          <Area
            type="monotone"
            dataKey="estimate"
            stroke="var(--chart-1)"
            fill="url(#homeArea)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Home() {
  const locale = useCopy("en", "zh");
  return (
    <div className="flex flex-col gap-12 pb-10">
      <section className="probability-grid overflow-hidden rounded-2xl border bg-card/65 p-5 shadow-[0_30px_100px_rgb(0_0_0/22%)] sm:p-8 lg:grid lg:min-h-[570px] lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-10 lg:p-12">
        <div className="relative z-10 max-w-xl">
          <Badge variant="outline">EDUCATION · SIMULATION · RESEARCH</Badge>
          <h1 className="mt-7">
            <span className="block text-sm font-semibold tracking-[0.3em] text-primary">
              POKERLAB
            </span>
            <span className="font-display mt-5 block text-5xl leading-[0.92] tracking-[-0.055em] sm:text-7xl">
              Probability.
              <br />
              Strategy.
              <br />
              <em className="text-muted-foreground">Uncertainty.</em>
            </span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground">
            {locale === "zh"
              ? "用德州扑克探索概率、可复现实验、决策理论与博弈论。这里没有真钱、实时牌局建议或伪造的求解器指标。"
              : "Explore probability, reproducible simulation, decision theory, and game theory through Heads-Up Hold’em—without real money, live-game advice, or fabricated solver metrics."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className={cn(buttonVariants({ size: "lg" }), "min-w-36")}
              href="/trainer"
            >
              {locale === "zh" ? "开始训练" : "Start training"}
              <ArrowRight />
            </Link>
            <Link
              className={buttonVariants({ variant: "outline", size: "lg" })}
              href="/equity"
            >
              {locale === "zh" ? "打开胜率实验室" : "Open Equity Lab"}
            </Link>
          </div>
        </div>
        <div className="mt-10 lg:mt-0">
          <PokerTable
            hero={["As", "Ks"]}
            villain={["Qh", "Qd"]}
            board={["Js", "8s", "2c"]}
          />
          <Card className="relative -mt-5 ml-auto max-w-lg bg-card/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Seeded Monte Carlo / 可复现蒙特卡洛</CardTitle>
              <CardDescription>Real API output · seed 20250902</CardDescription>
            </CardHeader>
            <CardContent>
              <ConvergencePreview />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="modules-title">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="font-data text-[11px] tracking-[0.15em] text-primary uppercase">
              Six instruments / 六个研究工具
            </p>
            <h2
              id="modules-title"
              className="font-display mt-2 text-3xl tracking-[-0.03em] sm:text-4xl"
            >
              {locale === "zh"
                ? "从一手牌开始，进入数学。"
                : "Begin with a hand. End in the mathematics."}
            </h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card
                key={module.href}
                className="group transition hover:-translate-y-1 hover:border-primary/35"
              >
                <CardHeader>
                  <span className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-primary">
                    <Icon />
                  </span>
                  <CardTitle>
                    {locale === "zh" ? module.zh : module.title}
                  </CardTitle>
                  <CardDescription>
                    {locale === "zh" ? module.zhDesc : module.desc}
                  </CardDescription>
                  <CardAction>
                    <Badge variant="secondary">LIVE</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="h-px w-full bg-gradient-to-r from-primary/50 to-transparent" />
                </CardContent>
                <CardFooter>
                  <Link
                    href={module.href}
                    className="inline-flex items-center gap-1 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {locale === "zh" ? "进入模块" : "Open module"}
                    <ArrowRight />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
