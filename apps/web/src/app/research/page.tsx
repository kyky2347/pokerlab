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
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyJson, downloadJson, postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import type { BayesianResult, EquityResult } from "@/lib/types";
import {
  agentCsvRows,
  parseResearchSeed,
  policyCopy,
  serializeCsv,
  type AgentResult,
} from "@/lib/research";
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
  const csv = serializeCsv(rows);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
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
  const [agentSeed, setAgentSeed] = useState("20250902");
  const parsedAgentSeed = parseResearchSeed(agentSeed);
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
    mutationFn: (parameters: { episodes: number; seed: number }) =>
      postJson<AgentResult>("/research/agents", parameters),
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
                    : "Synthetic river call/fold decisions—not complete poker strength."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-disabled={agents.isPending}>
                    <FieldLabel htmlFor="agent-episodes">
                      {zh ? "决策数量" : "Decisions"}
                    </FieldLabel>
                    <Select
                      value={String(episodes)}
                      disabled={agents.isPending}
                      onValueChange={(value) => {
                        agents.reset();
                        setEpisodes(Number(value));
                      }}
                    >
                      <SelectTrigger id="agent-episodes" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {[100, 1000, 10000].map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value.toLocaleString(zh ? "zh-CN" : "en-US")}{" "}
                              {zh ? "次" : "decisions"}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    data-invalid={parsedAgentSeed === null}
                    data-disabled={agents.isPending}
                  >
                    <FieldLabel htmlFor="agent-seed">
                      {zh ? "随机种子" : "Random seed"}
                    </FieldLabel>
                    <Input
                      id="agent-seed"
                      inputMode="numeric"
                      value={agentSeed}
                      disabled={agents.isPending}
                      aria-invalid={parsedAgentSeed === null}
                      aria-describedby={
                        parsedAgentSeed === null
                          ? "agent-seed-error"
                          : "agent-seed-help"
                      }
                      onChange={(event) => {
                        agents.reset();
                        setAgentSeed(event.target.value);
                      }}
                    />
                    {parsedAgentSeed === null ? (
                      <FieldError id="agent-seed-error">
                        {zh
                          ? "请输入 0 至 9007199254740991 的整数。"
                          : "Enter an integer from 0 to 9007199254740991."}
                      </FieldError>
                    ) : (
                      <FieldDescription id="agent-seed-help">
                        {zh
                          ? "相同种子、数量与方法版本可复现相同结果。"
                          : "Same seed, count, and method version reproduce the same results."}
                      </FieldDescription>
                    )}
                  </Field>
                </FieldGroup>
                <Button
                  size="lg"
                  onClick={() => {
                    if (parsedAgentSeed !== null)
                      agents.mutate({ episodes, seed: parsedAgentSeed });
                  }}
                  disabled={agents.isPending || parsedAgentSeed === null}
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
                  <>
                    <p className="font-data text-xs text-muted-foreground">
                      seed {agents.data.seed} ·{" "}
                      {agents.data.episodes.toLocaleString(
                        zh ? "zh-CN" : "en-US",
                      )}{" "}
                      · {ms(agents.data.runtime_ms)}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadJson(
                          `agent-comparison-${agents.data!.experiment_id}.json`,
                          agents.data,
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      {zh ? "下载完整 JSON" : "Download full JSON"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadCsv(
                          `agent-comparison-${agents.data!.experiment_id}.csv`,
                          agentCsvRows(agents.data!),
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      {zh ? "下载 CSV" : "Download CSV"}
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {zh ? "平均 EV 与决策遗憾" : "Average EV and decision regret"}
                </CardTitle>
                <CardDescription>
                  {zh
                    ? "单位：筹码/决策。统计所选动作的期望收益，不是实际牌局输赢；没有代理进行 CFR 训练。"
                    : "Chips per decision. Measures expected action values, not realized winnings; no agent trains with CFR."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {agents.data ? (
                  <>
                    {agents.data.agents.map((agent) => (
                      <div
                        key={agent.agent}
                        className="flex flex-col gap-4 border-b pb-5 last:border-0"
                      >
                        <div>
                          <p className="font-semibold">
                            {zh
                              ? (policyCopy[agent.agent]?.zh ?? agent.agent)
                              : (policyCopy[agent.agent]?.en ?? agent.agent)}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {zh
                              ? policyCopy[agent.agent]?.descriptionZh
                              : policyCopy[agent.agent]?.description}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                          <Metric
                            label={zh ? "平均 EV" : "Mean EV"}
                            value={agent.average_ev.toFixed(2)}
                            accent={
                              agent.average_ev >= 0 ? "success" : "danger"
                            }
                          />
                          <Metric
                            label={zh ? "决策遗憾" : "Decision regret"}
                            value={agent.decision_regret.toFixed(2)}
                          />
                          <Metric
                            label={zh ? "跟注频率" : "Call frequency"}
                            value={percent(agent.call_frequency, 1)}
                          />
                        </div>
                        <p className="font-data text-xs text-muted-foreground">
                          {zh
                            ? "平均 EV 的近似 95% 置信区间"
                            : "Approx. 95% CI for mean EV"}
                          : [{agent.ci_low.toFixed(2)},{" "}
                          {agent.ci_high.toFixed(2)}]
                        </p>
                      </div>
                    ))}
                    <p className="text-sm leading-6 text-muted-foreground">
                      {zh
                        ? "每个策略面对相同的随机情境，并知道真实胜率。置信区间衡量均值的不确定性，不能直接据此判断策略间差异显著；方差与完整方法随文件导出。"
                        : "Policies face the same generated scenarios and know the true equity. Intervals describe mean uncertainty, not pairwise statistical significance. Variance and full methodology are included in exports."}
                    </p>
                  </>
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {zh
                      ? "选择决策数量和种子，点击“比较代理”生成真实计算结果。"
                      : "Choose a decision count and seed, then compare agents to generate results."}
                  </p>
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
