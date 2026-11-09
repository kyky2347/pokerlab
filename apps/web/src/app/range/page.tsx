"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Calculator, RotateCcw, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";

import { CardSelector } from "@/components/card-selector";
import {
  ErrorAlert,
  LoadingLabel,
  Metric,
  PageHeader,
  ms,
  percent,
} from "@/components/lab-ui";
import { PokerCard } from "@/components/poker-card";
import { MonteCarloUncertainty } from "@/components/monte-carlo-uncertainty";
import {
  RangeMatrix,
  RangeWeights,
  handLabel,
  rangeRanks,
} from "@/components/range-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import type { RangeResult, RangeStatistics } from "@/lib/types";

const presetHands: Record<string, string[]> = {
  "Very Tight": ["AA", "KK", "QQ", "JJ", "AKs", "AKo"],
  Tight: [
    "AA",
    "KK",
    "QQ",
    "JJ",
    "TT",
    "99",
    "AKs",
    "AQs",
    "AJs",
    "KQs",
    "AKo",
    "AQo",
  ],
  Balanced: [
    "AA",
    "KK",
    "QQ",
    "JJ",
    "TT",
    "99",
    "88",
    "77",
    "AKs",
    "AQs",
    "AJs",
    "ATs",
    "KQs",
    "KJs",
    "QJs",
    "JTs",
    "T9s",
    "98s",
    "AKo",
    "AQo",
    "AJo",
    "KQo",
  ],
  Wide: [
    "AA",
    "KK",
    "QQ",
    "JJ",
    "TT",
    "99",
    "88",
    "77",
    "66",
    "55",
    "44",
    "AKs",
    "AQs",
    "AJs",
    "ATs",
    "A9s",
    "A8s",
    "KQs",
    "KJs",
    "KTs",
    "QJs",
    "QTs",
    "JTs",
    "T9s",
    "98s",
    "87s",
    "76s",
    "AKo",
    "AQo",
    "AJo",
    "ATo",
    "KQo",
    "KJo",
    "QJo",
  ],
};
const allHands = rangeRanks.flatMap((_, row) =>
  rangeRanks.map((__, column) => handLabel(row, column)),
);
const presetNamesZh: Record<string, string> = {
  "Very Tight": "极紧",
  Tight: "紧",
  Balanced: "均衡",
  Wide: "宽",
};

export default function RangeLab() {
  const zh = useCopy(false, true);
  const [hero, setHero] = useState<RangeWeights>({
    AA: 1,
    KK: 1,
    QQ: 1,
    AKs: 1,
    AKo: 0.5,
  });
  const [villain, setVillain] = useState<RangeWeights>({
    JJ: 1,
    TT: 1,
    AQs: 1,
    AQo: 1,
    KQs: 0.5,
  });
  const [active, setActive] = useState<"hero" | "villain">("hero");
  const [board, setBoard] = useState(["Ah", "7d", "5s", "3c", "2h"]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const weights = active === "hero" ? hero : villain;
  const statsKey = JSON.stringify({ active, weights, board });
  const [settledStatsKey, setSettledStatsKey] = useState(statsKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledStatsKey(statsKey), 150);
    return () => window.clearTimeout(timer);
  }, [statsKey]);
  const statsReady = statsKey === settledStatsKey;
  const stats = useQuery({
    // Change observers immediately to cancel obsolete reads; fetch only after
    // editing settles. Never label statistics from an older input as current.
    queryKey: ["range-stats", active, weights, board],
    enabled: statsReady,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      postJson<RangeStatistics>(
        "/range/statistics",
        { range: weights, blocked: board },
        signal,
      ),
  });
  const calculation = useMutation({
    mutationFn: () =>
      postJson<RangeResult>("/range/equity", {
        hero_range: hero,
        villain_range: villain,
        board,
        samples: 20000,
        seed: 20250902,
      }),
  });
  const currentKey = JSON.stringify({ hero, villain, board });
  const result = resultKey === currentKey ? calculation.data : undefined;
  const sampled = result?.method === "monte_carlo_weighted_pairs";
  const exact = result?.method === "exact_weighted_enumeration";
  function invalidateResult() {
    setResultKey(null);
    calculation.reset();
  }
  function updateWeights(next: RangeWeights) {
    invalidateResult();
    if (active === "hero") setHero(next);
    else setVillain(next);
  }
  function preset(name: string) {
    updateWeights(
      Object.fromEntries(presetHands[name].map((hand) => [hand, 1])),
    );
  }
  function invert() {
    updateWeights(
      Object.fromEntries(
        allHands.map((hand) => [hand, (weights[hand] ?? 0) > 0 ? 0 : 1]),
      ),
    );
  }
  function chooseBoard(card: string) {
    if (board.length < 5) {
      invalidateResult();
      setBoard([...board, card]);
    }
  }
  function removeBoard(card: string) {
    invalidateResult();
    setBoard(board.filter((value) => value !== card));
  }
  function calculate() {
    setResultKey(currentKey);
    calculation.mutate();
  }
  return (
    <div>
      <PageHeader
        eyebrow={zh ? "模块 02 · 组合数学" : "Module 02 · Combinatorics"}
        title={zh ? "范围实验室" : "Range Lab"}
        description={
          zh
            ? "从 169 个起手牌类别展开为 1,326 个物理组合；权重与阻断牌在后端统一计算。"
            : "Expand 169 starting-hand classes into 1,326 physical combos. Weights and blockers are resolved by the backend."
        }
        badge={zh ? "考虑阻断牌" : "BLOCKER-AWARE"}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(680px,1fr)_330px]">
        <Card>
          <CardHeader>
            <CardTitle>
              {zh ? "加权起手牌矩阵" : "Weighted starting-hand matrix"}
            </CardTitle>
            <CardDescription>
              {zh
                ? "上三角同花，下三角非同花，对角线为口袋对子。"
                : "Suited above the diagonal, offsuit below, pocket pairs on the diagonal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <Tabs
              value={active}
              onValueChange={(value) => setActive(value as "hero" | "villain")}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="hero">
                  {zh ? "英雄范围" : "Hero range"}
                </TabsTrigger>
                <TabsTrigger value="villain">
                  {zh ? "对手范围" : "Villain range"}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hero">
                <RangeMatrix
                  value={hero}
                  onChange={updateWeights}
                  label={zh ? "英雄加权范围" : "Hero weighted range"}
                />
              </TabsContent>
              <TabsContent value="villain">
                <RangeMatrix
                  value={villain}
                  onChange={updateWeights}
                  label={zh ? "对手加权范围" : "Villain weighted range"}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "示例预设" : "Illustrative presets"}</CardTitle>
              <CardDescription>
                {zh
                  ? "教学用，不代表普适最优策略。"
                  : "Educational examples—not universally optimal strategy."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.keys(presetHands).map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={() => preset(name)}
                >
                  {zh ? presetNamesZh[name] : name}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={invert}>
                <Shuffle data-icon="inline-start" />
                {zh ? "反选" : "Invert"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateWeights({})}
              >
                <RotateCcw data-icon="inline-start" />
                {zh ? "清空" : "Clear"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {zh
                  ? `${active === "hero" ? "英雄" : "对手"}范围统计`
                  : `${active === "hero" ? "Hero" : "Villain"} range statistics`}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "类别 ≠ 组合 ≠ 加权组合。"
                  : "Class ≠ combo ≠ weighted combo."}
              </CardDescription>
            </CardHeader>
            <CardContent
              className="grid grid-cols-2 gap-5"
              aria-busy={!statsReady || stats.isFetching}
            >
              {!statsReady ? (
                <p
                  role="status"
                  className="col-span-2 text-sm text-muted-foreground"
                >
                  {zh ? "等待编辑完成…" : "Waiting for edits to finish…"}
                </p>
              ) : stats.isError && !stats.isFetching ? (
                <div className="col-span-2 flex flex-col gap-3">
                  <ErrorAlert
                    message={`${zh ? "无法获取范围统计，请检查 API 服务后重试。" : "Could not load range statistics. Check the API service and retry."} ${stats.error.message}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void stats.refetch()}
                  >
                    <RotateCcw data-icon="inline-start" />
                    {zh ? "重试统计" : "Retry statistics"}
                  </Button>
                </div>
              ) : stats.data && !stats.isFetching ? (
                <>
                  <Metric
                    label={zh ? "起手牌类别" : "Hand classes"}
                    value={String(stats.data.hand_classes)}
                  />
                  <Metric
                    label={zh ? "物理组合" : "Physical combos"}
                    value={String(stats.data.physical_combos)}
                  />
                  <Metric
                    label={zh ? "占全部起手牌" : "All starts"}
                    value={`${stats.data.range_percent.toFixed(2)}%`}
                  />
                  <Metric
                    label={zh ? "阻断后组合" : "After blockers"}
                    value={String(stats.data.blocker_adjusted_combos)}
                  />
                  <Metric
                    label={zh ? "加权组合" : "Weighted combos"}
                    value={stats.data.weighted_combos.toFixed(2)}
                  />
                </>
              ) : (
                <p
                  role="status"
                  className="col-span-2 text-sm text-muted-foreground"
                >
                  {stats.fetchStatus === "paused"
                    ? zh
                      ? "当前离线，恢复连接后将继续更新统计。"
                      : "You are offline. Statistics will resume when you reconnect."
                    : zh
                      ? "正在计算组合…"
                      : "Calculating combinations…"}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "公共牌" : "Board"}</CardTitle>
              <CardDescription>
                {zh
                  ? "点击牌可移除，再从牌组补齐。"
                  : "Click a card to remove it, then add from the deck."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-2">
                {board.map((card) => (
                  <PokerCard
                    key={card}
                    card={card}
                    compact
                    onClick={() => removeBoard(card)}
                  />
                ))}
              </div>
              <CardSelector
                selected={board}
                onSelect={chooseBoard}
                label={zh ? "公共牌选择器" : "Board selector"}
              />
            </CardContent>
          </Card>
          <Button
            size="lg"
            disabled={
              calculation.isPending ||
              board.length !== 5 ||
              !Object.values(hero).some(Boolean) ||
              !Object.values(villain).some(Boolean)
            }
            onClick={calculate}
          >
            <Calculator data-icon="inline-start" />
            {calculation.isPending ? (
              <LoadingLabel>{zh ? "计算中" : "Calculating"}</LoadingLabel>
            ) : zh ? (
              "计算范围对范围"
            ) : (
              "Calculate range vs range"
            )}
          </Button>
          {calculation.error && resultKey === currentKey ? (
            <ErrorAlert message={calculation.error.message} />
          ) : null}
        </div>
      </div>
      {result ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>
              {zh ? "阻断牌感知结果" : "Blocker-aware result"}
            </CardTitle>
            <CardDescription>
              {sampled
                ? zh
                  ? "蒙特卡洛估计"
                  : "Monte Carlo estimate"
                : exact
                  ? zh
                    ? "精确加权枚举"
                    : "Exact weighted enumeration"
                  : result.method}{" "}
              · {result.engine}
              {sampled ? ` · ${zh ? "种子" : "Seed"} ${result.seed}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label={zh ? "英雄权益" : "Hero equity"}
              value={percent(result.hero_equity)}
              accent="primary"
            />
            <Metric
              label={zh ? "对手权益" : "Villain equity"}
              value={percent(result.villain_equity)}
            />
            <Metric label={zh ? "平局" : "Tie"} value={percent(result.tie)} />
            <Metric
              label={zh ? "合法组合对" : "Valid pairs"}
              value={result.valid_combo_pairs.toLocaleString()}
            />
            <Metric
              label={
                sampled
                  ? zh
                    ? "样本数"
                    : "Samples"
                  : zh
                    ? "评估状态"
                    : "States"
              }
              value={result.evaluated_states.toLocaleString()}
            />
            <Metric
              label={zh ? "耗时" : "Runtime"}
              value={ms(result.runtime_ms)}
            />
          </CardContent>
          {sampled ? (
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {zh
                  ? "下方区间描述给定范围、权重和公共牌下英雄权益的抽样误差，不涵盖对手范围假设的偏差。"
                  : "The interval below measures sampling error in Hero equity for the supplied ranges, weights and board. It does not cover uncertainty in your opponent-range assumptions."}
              </p>
              <MonteCarloUncertainty result={result} zh={zh} />
            </CardContent>
          ) : exact ? (
            <CardContent className="text-sm text-muted-foreground">
              {zh
                ? "已枚举给定范围与公共牌下的全部合法状态，没有蒙特卡洛抽样误差。"
                : "Every legal state for these ranges and this board was enumerated; there is no Monte Carlo sampling error."}
            </CardContent>
          ) : null}
        </Card>
      ) : null}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{zh ? "三个不同层级" : "Three different units"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <p>
            <Badge variant="secondary">{zh ? "手牌类别" : "Hand class"}</Badge>
            <br />
            <br />
            {zh ? "AKs 是一个抽象手牌类别。" : "AKs is one abstract category."}
          </p>
          <p>
            <Badge variant="secondary">{zh ? "组合" : "Combo"}</Badge>
            <br />
            <br />
            {zh
              ? "A♠K♠ 是一个具体的物理组合。"
              : "A♠K♠ is one physical realization."}
          </p>
          <p>
            <Badge variant="secondary">
              {zh ? "加权组合" : "Weighted combo"}
            </Badge>
            <br />
            <br />
            {zh
              ? "阻断前，一个 50% 权重组合贡献 0.5 的权重质量。"
              : "A 50% combo contributes 0.5 mass before blockers."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
