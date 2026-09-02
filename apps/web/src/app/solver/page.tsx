"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
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
} from "@/components/lab-ui";
import { handLabel, rangeRanks } from "@/components/range-matrix";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { getJson, postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";

type SolverResult = {
  id: string;
  status: string;
  iterations: number;
  average_regret: number;
  strategy_stability: number;
  valid_combo_pairs: number;
  information_sets: number;
  runtime_ms: number;
  engine: string;
  convergence: Array<{
    iteration: number;
    average_regret: number;
    strategy_change: number;
  }>;
  strategy: Record<
    string,
    {
      combo_count: number;
      actions: { check: number; bet_small: number; bet_large: number };
    }
  >;
  tree: { raises: boolean };
  disclaimer: string;
};
type Kuhn = {
  passed: boolean;
  game_value_player_0: number;
  known_value_player_0: number;
  value_error: number;
  iterations: number;
};
function InputSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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

export default function Solver() {
  const zh = useCopy(false, true);
  const [pot, setPot] = useState(100);
  const [stack, setStack] = useState(100);
  const [small, setSmall] = useState(50);
  const [large, setLarge] = useState(100);
  const [iterations, setIterations] = useState(200);
  const kuhn = useQuery({
    queryKey: ["kuhn-verification"],
    queryFn: () => getJson<Kuhn>("/solver/kuhn-verification"),
    staleTime: Infinity,
  });
  const solver = useMutation({
    mutationFn: () =>
      postJson<SolverResult>("/solver/jobs", {
        board: ["Ah", "Kd", "7s", "3c", "2d"],
        oop_range: { AQo: 1, AJo: 0.75 },
        ip_range: { KQo: 1, KJo: 0.75 },
        pot,
        effective_stack: stack,
        bet_small: small / 100,
        bet_large: large / 100,
        iterations,
      }),
  });
  const smallAmount = Math.min(stack, (pot * small) / 100);
  const largeAmount = Math.min(stack, (pot * large) / 100);
  const hasDistinctBetSizes = smallAmount < largeAmount;
  function resetSolverResult() {
    solver.reset();
  }
  function changeSmall(value: number) {
    resetSolverResult();
    setSmall(value);
    if (value >= large) setLarge(Math.min(150, value + 5));
  }
  function changeLarge(value: number) {
    resetSolverResult();
    setLarge(value);
    if (value <= small) setSmall(Math.max(20, value - 5));
  }
  return (
    <div>
      <PageHeader
        eyebrow="Module 05 · Game theory"
        title={zh ? "CFR 轻量求解器" : "CFR Solver Lite"}
        description={
          zh
            ? "从零实现的 CFR+，运行于固定河牌、加权范围和有限无加注博弈树。"
            : "From-scratch CFR+ over fixed river cards, weighted ranges, and a finite no-raise betting tree."
        }
        badge="EDUCATIONAL APPROXIMATE SOLVER"
      />
      <Alert className="mb-5">
        <TriangleAlert />
        <AlertTitle>
          {zh
            ? "有限抽象，不是完整 GTO 求解器"
            : "Finite abstraction—not a full GTO solver"}
        </AlertTitle>
        <AlertDescription>
          {zh
            ? "OOP 可过牌或使用两种下注；IP 在过牌后可过牌或下注；面对下注只能弃牌或跟注。没有加注。"
            : "OOP may check or use two bet sizes. IP may check or bet after a check. Facing a bet, a player may only fold or call. There are no raises."}
        </AlertDescription>
      </Alert>
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "求解参数" : "Solver parameters"}</CardTitle>
              <CardDescription>
                Board A♥ K♦ 7♠ 3♣ 2♦ · fixed weighted demo ranges
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <InputSlider
                label={zh ? "底池" : "Pot"}
                value={pot}
                min={20}
                max={500}
                step={10}
                onChange={(value) => {
                  resetSolverResult();
                  setPot(value);
                }}
                disabled={solver.isPending}
              />
              <InputSlider
                label={zh ? "有效筹码" : "Effective stack"}
                value={stack}
                min={20}
                max={500}
                step={10}
                onChange={(value) => {
                  resetSolverResult();
                  setStack(value);
                }}
                disabled={solver.isPending}
              />
              <InputSlider
                label={zh ? "小下注（% 底池）" : "Small bet (% pot)"}
                value={small}
                min={20}
                max={80}
                step={5}
                onChange={changeSmall}
                disabled={solver.isPending}
              />
              <InputSlider
                label={zh ? "大下注（% 底池）" : "Large bet (% pot)"}
                value={large}
                min={60}
                max={150}
                step={5}
                onChange={changeLarge}
                disabled={solver.isPending}
              />
              <InputSlider
                label={zh ? "迭代次数" : "Iterations"}
                value={iterations}
                min={100}
                max={500}
                step={100}
                onChange={(value) => {
                  resetSolverResult();
                  setIterations(value);
                }}
                disabled={solver.isPending}
              />
              {!hasDistinctBetSizes ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>
                    {zh
                      ? "下注尺寸被筹码上限合并"
                      : "Bet sizes collapse at this stack"}
                  </AlertTitle>
                  <AlertDescription>
                    {zh
                      ? "提高有效筹码，或降低小下注尺寸，确保博弈树中存在两个不同动作。"
                      : "Increase the effective stack or reduce the small bet so the tree has two distinct actions."}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                size="lg"
                onClick={() => solver.mutate()}
                disabled={solver.isPending || !hasDistinctBetSizes}
              >
                <Play data-icon="inline-start" />
                {solver.isPending ? (
                  <LoadingLabel>
                    {zh ? "真实迭代运行中" : "Running real iterations"}
                  </LoadingLabel>
                ) : zh ? (
                  "运行求解器"
                ) : (
                  "Run solver"
                )}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck
                className={
                  kuhn.data?.passed ? "text-success" : "text-muted-foreground"
                }
              />
              <CardTitle>Kuhn Poker fixture</CardTitle>
              <CardDescription>
                {zh
                  ? "在进入 Hold’em 树前独立验证 CFR。"
                  : "Independent CFR verification before the Hold’em tree."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {kuhn.data ? (
                <div className="grid grid-cols-2 gap-5">
                  <Metric
                    label="Status"
                    value={kuhn.data.passed ? "PASS" : "FAIL"}
                    accent={kuhn.data.passed ? "success" : "danger"}
                  />
                  <Metric
                    label="Value error"
                    value={kuhn.data.value_error.toFixed(5)}
                  />
                  <Metric
                    label="Observed P0"
                    value={kuhn.data.game_value_player_0.toFixed(5)}
                  />
                  <Metric
                    label="Known −1/18"
                    value={kuhn.data.known_value_player_0.toFixed(5)}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Verifying…</p>
              )}
            </CardContent>
          </Card>
          {solver.error ? <ErrorAlert message={solver.error.message} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "求解器状态" : "Solver status"}</CardTitle>
              <CardDescription>
                {solver.data
                  ? `${solver.data.engine} · job ${solver.data.id.slice(0, 8)}`
                  : zh
                    ? "运行小型作业以生成真实策略。"
                    : "Run a small job to generate a real strategy."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {solver.data ? (
                <>
                  <Metric
                    label="Iteration"
                    value={solver.data.iterations.toLocaleString()}
                  />
                  <Metric
                    label="Average regret"
                    value={solver.data.average_regret.toExponential(2)}
                  />
                  <Metric
                    label="Stability"
                    value={`${(solver.data.strategy_stability * 100).toFixed(2)}%`}
                  />
                  <Metric
                    label="Information sets"
                    value={solver.data.information_sets.toLocaleString()}
                  />
                  <Metric label="Runtime" value={ms(solver.data.runtime_ms)} />
                </>
              ) : (
                <p className="col-span-full text-sm text-muted-foreground">
                  STATUS · IDLE
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {zh ? "OOP 根节点策略矩阵" : "OOP root strategy matrix"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "黄：过牌，绿：小下注，红：大下注。悬停查看精确频率。"
                  : "Gold: check, green: small bet, red: large bet. Hover for exact frequencies."}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="grid min-w-[620px] grid-cols-13 gap-1">
                {rangeRanks.flatMap((_, row) =>
                  rangeRanks.map((__, column) => {
                    const hand = handLabel(row, column);
                    const strategy = solver.data?.strategy[hand];
                    const actions = strategy?.actions;
                    return (
                      <div
                        key={hand}
                        title={
                          actions
                            ? `Check ${(actions.check * 100).toFixed(1)}% · Small ${(actions.bet_small * 100).toFixed(1)}% · Large ${(actions.bet_large * 100).toFixed(1)}%`
                            : hand
                        }
                        className="relative aspect-square overflow-hidden rounded-md border bg-muted/30"
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 flex h-full"
                          aria-hidden="true"
                        >
                          {actions ? (
                            <>
                              <span
                                style={{
                                  width: `${actions.check * 100}%`,
                                  background: "var(--chart-1)",
                                }}
                              />
                              <span
                                style={{
                                  width: `${actions.bet_small * 100}%`,
                                  background: "var(--chart-2)",
                                }}
                              />
                              <span
                                style={{
                                  width: `${actions.bet_large * 100}%`,
                                  background: "var(--chart-3)",
                                }}
                              />
                            </>
                          ) : null}
                        </div>
                        <span className="relative flex h-full items-center justify-center text-[10px] font-semibold text-white drop-shadow-[0_1px_2px_rgb(0_0_0/80%)] sm:text-xs">
                          {hand}
                        </span>
                      </div>
                    );
                  }),
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {zh ? "收敛诊断" : "Convergence diagnostics"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "平均正遗憾与平均策略变化。收敛不证明该抽象之外的最优性。"
                  : "Mean positive regret and average-strategy change. Convergence does not prove optimality outside this abstraction."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {solver.data ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={solver.data.convergence}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="iteration"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        scale="log"
                        domain={["auto", "auto"]}
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
                      />
                      <Line
                        type="monotone"
                        dataKey="average_regret"
                        stroke="var(--chart-1)"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="strategy_change"
                        stroke="var(--chart-2)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  <BrainCircuit />{" "}
                  <span className="ml-2">
                    {zh ? "等待真实求解结果" : "Awaiting a real solver result"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
