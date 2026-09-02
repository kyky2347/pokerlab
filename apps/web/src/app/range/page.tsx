"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Calculator, RotateCcw, Shuffle } from "lucide-react";
import { useState } from "react";

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
  const stats = useQuery({
    queryKey: ["range-stats", active, weights, board],
    queryFn: () =>
      postJson<RangeStatistics>("/range/statistics", {
        range: weights,
        blocked: board,
      }),
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
        eyebrow="Module 02 · Combinatorics"
        title={zh ? "范围实验室" : "Range Lab"}
        description={
          zh
            ? "从 169 个起手牌类别展开为 1,326 个物理组合；权重与阻断牌在后端统一计算。"
            : "Expand 169 starting-hand classes into 1,326 physical combos. Weights and blockers are resolved by the backend."
        }
        badge="BLOCKER-AWARE"
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
                <div className="max-w-full overflow-x-auto">
                  <RangeMatrix
                    value={hero}
                    onChange={updateWeights}
                    label={zh ? "英雄加权范围" : "Hero weighted range"}
                  />
                </div>
              </TabsContent>
              <TabsContent value="villain">
                <div className="max-w-full overflow-x-auto">
                  <RangeMatrix
                    value={villain}
                    onChange={updateWeights}
                    label={zh ? "对手加权范围" : "Villain weighted range"}
                  />
                </div>
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
                  {name}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={invert}>
                <Shuffle data-icon="inline-start" />
                Invert
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateWeights({})}
              >
                <RotateCcw data-icon="inline-start" />
                Clear
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {active === "hero" ? "Hero" : "Villain"}{" "}
                {zh ? "范围统计" : "range statistics"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "类别 ≠ 组合 ≠ 加权组合。"
                  : "Class ≠ combo ≠ weighted combo."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              {stats.data ? (
                <>
                  <Metric
                    label="Hand classes"
                    value={String(stats.data.hand_classes)}
                  />
                  <Metric
                    label="Physical combos"
                    value={String(stats.data.physical_combos)}
                  />
                  <Metric
                    label="All starts"
                    value={`${stats.data.range_percent.toFixed(2)}%`}
                  />
                  <Metric
                    label="After blockers"
                    value={String(stats.data.blocker_adjusted_combos)}
                  />
                  <Metric
                    label="Weighted combos"
                    value={stats.data.weighted_combos.toFixed(2)}
                  />
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">
                  Calculating combinations…
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
                label="Board selector"
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
              {result.method} · {result.engine}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Hero equity"
              value={percent(result.hero_equity)}
              accent="primary"
            />
            <Metric
              label="Villain equity"
              value={percent(result.villain_equity)}
            />
            <Metric label="Tie" value={percent(result.tie)} />
            <Metric
              label="Valid pairs"
              value={result.valid_combo_pairs.toLocaleString()}
            />
            <Metric
              label="States"
              value={result.evaluated_states.toLocaleString()}
            />
            <Metric label="Runtime" value={ms(result.runtime_ms)} />
          </CardContent>
        </Card>
      ) : null}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{zh ? "三个不同层级" : "Three different units"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <p>
            <Badge variant="secondary">Hand class</Badge>
            <br />
            <br />
            AKs is one abstract category.
          </p>
          <p>
            <Badge variant="secondary">Combo</Badge>
            <br />
            <br />
            A♠K♠ is one physical realization.
          </p>
          <p>
            <Badge variant="secondary">Weighted combo</Badge>
            <br />
            <br />A 50% combo contributes 0.5 mass before blockers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
