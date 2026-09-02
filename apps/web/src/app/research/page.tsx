"use client";

import { useMutation } from "@tanstack/react-query";
import { Bot, Clipboard, Download, FlaskConical, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ErrorAlert,
  LoadingLabel,
  Metric,
  PageHeader,
  ms,
  percent,
} from "@/components/lab-ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyJson, downloadJson, postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import type { BayesianResult, EquityResult } from "@/lib/types";

type AgentResult = {
  episodes: number;
  seed: number;
  agents: Array<{
    agent: string;
    average_ev: number;
    decision_regret: number;
    variance: number;
  }>;
  runtime_ms: number;
  scope: string;
  experiment_id: string;
};
function Param({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-data text-foreground">{value}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) =>
          onChange(Number(Array.isArray(values) ? values[0] : values))
        }
        aria-label={label}
        disabled={disabled}
      />
    </label>
  );
}
function downloadCsv(
  filename: string,
  rows: Record<string, string | number>[],
) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => JSON.stringify(row[key])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Research() {
  const zh = useCopy(false, true);
  const [alpha, setAlpha] = useState(2);
  const [beta, setBeta] = useState(2);
  const [aggressive, setAggressive] = useState(4);
  const [passive, setPassive] = useState(3);
  const [episodes, setEpisodes] = useState(1000);
  const initialBayesRun = useRef(false);
  const bayes = useMutation({
    mutationFn: (parameters: {
      alpha: number;
      beta: number;
      aggressive: number;
      passive: number;
    }) =>
      postJson<BayesianResult>("/research/bayesian", {
        alpha: parameters.alpha,
        beta: parameters.beta,
        aggressive_actions: parameters.aggressive,
        passive_actions: parameters.passive,
        credible_level: 0.95,
      }),
  });
  const monte = useMutation({
    mutationFn: () =>
      postJson<EquityResult>("/research/monte-carlo", {
        hero: ["Jh", "Th"],
        villain: ["As", "Ac"],
        board: ["9h", "8h", "2d"],
        samples: 10000,
        seed: 20250902,
      }),
  });
  const agents = useMutation({
    mutationFn: () =>
      postJson<AgentResult>("/research/agents", { episodes, seed: 20250902 }),
  });
  function runBayesianUpdate() {
    bayes.mutate({ alpha, beta, aggressive, passive });
  }
  useEffect(() => {
    if (!initialBayesRun.current) {
      initialBayesRun.current = true;
      bayes.mutate({ alpha: 2, beta: 2, aggressive: 4, passive: 3 });
    }
  }, [bayes]);
  return (
    <div>
      <PageHeader
        eyebrow="Module 06 · Reproducible research"
        title={zh ? "研究 / AI 实验室" : "Research / AI Lab"}
        description={
          zh
            ? "观察蒙特卡洛收敛、比较透明决策代理，并通过 Beta–Binomial 更新理解小样本不确定性。"
            : "Inspect Monte Carlo convergence, compare transparent decision agents, and reason about small-sample uncertainty with Beta–Binomial updates."
        }
        badge="SEED + PARAMETERS + EXPORT"
      />
      <Tabs defaultValue="bayesian">
        <TabsList className="mb-5">
          <TabsTrigger value="bayesian">
            {zh ? "贝叶斯模型" : "Bayesian model"}
          </TabsTrigger>
          <TabsTrigger value="monte">Monte Carlo</TabsTrigger>
          <TabsTrigger value="agents">
            {zh ? "代理对比" : "Agent comparison"}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bayesian">
          <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "未知激进频率" : "Unknown aggression rate"}
                </CardTitle>
                <CardDescription>p ~ Beta(α, β)</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-7">
                <Param
                  label="Prior α"
                  value={alpha}
                  min={0.5}
                  max={20}
                  step={0.5}
                  onChange={(value) => {
                    bayes.reset();
                    setAlpha(value);
                  }}
                  disabled={bayes.isPending}
                />
                <Param
                  label="Prior β"
                  value={beta}
                  min={0.5}
                  max={20}
                  step={0.5}
                  onChange={(value) => {
                    bayes.reset();
                    setBeta(value);
                  }}
                  disabled={bayes.isPending}
                />
                <Param
                  label={zh ? "激进行为" : "Aggressive actions"}
                  value={aggressive}
                  min={0}
                  max={50}
                  onChange={(value) => {
                    bayes.reset();
                    setAggressive(value);
                  }}
                  disabled={bayes.isPending}
                />
                <Param
                  label={zh ? "非激进行为" : "Passive opportunities"}
                  value={passive}
                  min={0}
                  max={50}
                  onChange={(value) => {
                    bayes.reset();
                    setPassive(value);
                  }}
                  disabled={bayes.isPending}
                />
                <Button onClick={runBayesianUpdate} disabled={bayes.isPending}>
                  <Play data-icon="inline-start" />
                  {bayes.isPending
                    ? zh
                      ? "更新中"
                      : "Updating"
                    : zh
                      ? "更新后验"
                      : "Update posterior"}
                </Button>
                {bayes.data ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyJson({
                          parameters: { alpha, beta, aggressive, passive },
                          results: bayes.data,
                        })
                      }
                    >
                      <Clipboard data-icon="inline-start" />
                      {zh ? "复制 JSON" : "Copy JSON"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadJson(
                          `bayesian-${bayes.data.experiment_id}.json`,
                          bayes.data,
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      JSON
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {zh ? "先验与后验密度" : "Prior and posterior density"}
                  </CardTitle>
                  <CardDescription>
                    {zh
                      ? "有限观察不会消除不确定性；阴影分布显示完整后验。"
                      : "Finite observations do not erase uncertainty; the full posterior remains visible."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bayes.data ? (
                    <div className="h-[360px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={bayes.data.density}
                          margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="posteriorArea"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0"
                                stopColor="var(--chart-2)"
                                stopOpacity={0.4}
                              />
                              <stop
                                offset="1"
                                stopColor="var(--chart-2)"
                                stopOpacity={0.02}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="var(--border)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="p"
                            tickFormatter={(v) => `${Math.round(v * 100)}%`}
                            tick={{
                              fill: "var(--muted-foreground)",
                              fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{
                              fill: "var(--muted-foreground)",
                              fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                            }}
                            labelFormatter={(v) =>
                              `p = ${(Number(v) * 100).toFixed(1)}%`
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="prior"
                            stroke="var(--chart-1)"
                            dot={false}
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="posterior"
                            stroke="var(--chart-2)"
                            fill="url(#posteriorArea)"
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              {bayes.data ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Posterior Beta({bayes.data.posterior.alpha},{" "}
                      {bayes.data.posterior.beta})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 sm:grid-cols-3">
                    <Metric
                      label="Prior mean"
                      value={percent(bayes.data.prior.mean)}
                    />
                    <Metric
                      label="Posterior mean"
                      value={percent(bayes.data.posterior.mean)}
                      accent="primary"
                    />
                    <Metric
                      label="95% credible interval"
                      value={`${percent(bayes.data.posterior.credible_interval[0], 1)}–${percent(bayes.data.posterior.credible_interval[1], 1)}`}
                    />
                  </CardContent>
                </Card>
              ) : null}
              {bayes.error ? (
                <ErrorAlert message={bayes.error.message} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="monte">
          <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "收敛实验" : "Convergence experiment"}
                </CardTitle>
                <CardDescription>J♥ T♥ vs A♠ A♣ · 9♥ 8♥ 2♦</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button
                  size="lg"
                  onClick={() => monte.mutate()}
                  disabled={monte.isPending}
                >
                  <Play data-icon="inline-start" />
                  {monte.isPending ? (
                    <LoadingLabel>{zh ? "模拟中" : "Simulating"}</LoadingLabel>
                  ) : zh ? (
                    "运行 10,000 次"
                  ) : (
                    "Run 10,000 samples"
                  )}
                </Button>
                {monte.data ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => copyJson(monte.data)}
                    >
                      <Clipboard data-icon="inline-start" />
                      Copy experiment JSON
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadJson(
                          `monte-carlo-${monte.data.experiment_id}.json`,
                          monte.data,
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      Download JSON
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadCsv(
                          "monte-carlo-convergence.csv",
                          (monte.data?.convergence ?? []) as unknown as Record<
                            string,
                            string | number
                          >[],
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "真实样本轨迹" : "Real sample path"}
                </CardTitle>
                <CardDescription>
                  {monte.data
                    ? `seed ${monte.data.seed} · ${ms(monte.data.runtime_ms)}`
                    : zh
                      ? "运行后显示。"
                      : "Run to reveal."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {monte.data?.convergence ? (
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monte.data.convergence}>
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="samples"
                          tick={{
                            fill: "var(--muted-foreground)",
                            fontSize: 10,
                          }}
                          axisLine={false}
                        />
                        <YAxis
                          domain={["dataMin - .05", "dataMax + .05"]}
                          tickFormatter={(v) => percent(v, 0)}
                          tick={{
                            fill: "var(--muted-foreground)",
                            fontSize: 10,
                          }}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                          }}
                          formatter={(v) => percent(Number(v))}
                        />
                        <Line
                          type="monotone"
                          dataKey="estimate"
                          stroke="var(--chart-1)"
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="ci_low"
                          stroke="var(--chart-4)"
                          dot={false}
                          strokeDasharray="3 3"
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="ci_high"
                          stroke="var(--chart-4)"
                          dot={false}
                          strokeDasharray="3 3"
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                    <FlaskConical />
                  </div>
                )}
              </CardContent>
            </Card>
            {monte.error ? <ErrorAlert message={monte.error.message} /> : null}
          </div>
        </TabsContent>

        <TabsContent value="agents">
          <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "可复现批量对比" : "Reproducible batch"}
                </CardTitle>
                <CardDescription>
                  {zh
                    ? "单街河牌跟注/弃牌决策，不代表完整扑克实力。"
                    : "One-street river call/fold decisions—not complete poker strength."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select
                  value={String(episodes)}
                  disabled={agents.isPending}
                  onValueChange={(value) => {
                    agents.reset();
                    setEpisodes(Number(value));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[100, 1000, 10000].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value.toLocaleString()} {zh ? "局" : "episodes"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  size="lg"
                  onClick={() => agents.mutate()}
                  disabled={agents.isPending}
                >
                  <Bot data-icon="inline-start" />
                  {agents.isPending ? (
                    <LoadingLabel>
                      {zh ? "运行批次" : "Running batch"}
                    </LoadingLabel>
                  ) : zh ? (
                    "比较代理"
                  ) : (
                    "Compare agents"
                  )}
                </Button>
                {agents.data ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadCsv(
                        "agent-comparison.csv",
                        agents.data!.agents as unknown as Record<
                          string,
                          string | number
                        >[],
                      )
                    }
                  >
                    <Download data-icon="inline-start" />
                    {zh ? "下载 CSV" : "Download CSV"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "平均 EV 与决策遗憾" : "Average EV and decision regret"}
                </CardTitle>
                <CardDescription>
                  {agents.data?.scope ??
                    "Random · Pot odds · Equity · soft regret-matched policy"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {agents.data ? (
                  agents.data.agents.map((agent) => (
                    <div
                      key={agent.agent}
                      className="grid gap-3 rounded-lg border bg-muted/25 p-4 sm:grid-cols-[1fr_repeat(3,120px)] sm:items-center"
                    >
                      <p className="font-semibold">{agent.agent}</p>
                      <Metric
                        label="Average EV"
                        value={`$${agent.average_ev.toFixed(2)}`}
                        accent={agent.average_ev >= 0 ? "success" : "danger"}
                      />
                      <Metric
                        label="Decision regret"
                        value={`$${agent.decision_regret.toFixed(2)}`}
                      />
                      <Metric
                        label="Variance"
                        value={agent.variance.toFixed(1)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex h-72 items-center justify-center text-muted-foreground">
                    <Bot />
                  </div>
                )}
              </CardContent>
            </Card>
            {agents.error ? (
              <ErrorAlert message={agents.error.message} />
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
