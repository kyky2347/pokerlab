"use client";

import { useMutation } from "@tanstack/react-query";
import { Calculator, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { PokerTable } from "@/components/poker-table";
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
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import type { EquityResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Zone = "hero" | "villain" | "board";
type TurnMap = {
  turns: Array<{ card: string; equity: number }>;
  runtime_ms: number;
  engine: string;
};
const ranks = "AKQJT98765432".split("");
const suits = ["s", "h", "d", "c"];

export default function EquityLab() {
  const zh = useCopy(false, true);
  const [hero, setHero] = useState(["As", "Ks"]);
  const [villain, setVillain] = useState(["Qh", "Qd"]);
  const [board, setBoard] = useState(["Js", "8s", "2c"]);
  const [zone, setZone] = useState<Zone>("board");
  const [samples, setSamples] = useState(10000);
  const [seed, setSeed] = useState(20250902);
  const exact = useMutation({
    mutationFn: (value: string[]) =>
      postJson<EquityResult>("/equity/exact", { hero, villain, board: value }),
  });
  const monteCarlo = useMutation({
    mutationFn: (value: string[]) =>
      postJson<EquityResult>("/equity/monte-carlo", {
        hero,
        villain,
        board: value,
        samples,
        seed,
      }),
  });
  const turnMap = useMutation({
    mutationFn: (value: string[]) =>
      postJson<TurnMap>("/equity/turn-map", { hero, villain, board: value }),
  });

  const selected = [...hero, ...villain, ...board];
  function chooseCard(card: string) {
    if (zone === "hero" && hero.length < 2) {
      const next = [...hero, card];
      setHero(next);
      if (next.length === 2) setZone("villain");
    } else if (zone === "villain" && villain.length < 2) {
      const next = [...villain, card];
      setVillain(next);
      if (next.length === 2) setZone("board");
    } else if (zone === "board" && board.length < 5) setBoard([...board, card]);
  }
  function run(nextBoard = board) {
    if (
      hero.length !== 2 ||
      villain.length !== 2 ||
      ![0, 3, 4, 5].includes(nextBoard.length)
    )
      return;
    exact.mutate(nextBoard);
    monteCarlo.mutate(nextBoard);
    if (nextBoard.length === 3) turnMap.mutate(nextBoard);
    else turnMap.reset();
  }
  function applyTurn(card: string) {
    const next = [...board.slice(0, 3), card];
    setBoard(next);
    run(next);
  }
  function reset() {
    setHero([]);
    setVillain([]);
    setBoard([]);
    setZone("hero");
    exact.reset();
    monteCarlo.reset();
    turnMap.reset();
  }
  const error = exact.error ?? monteCarlo.error ?? turnMap.error;

  return (
    <div>
      <PageHeader
        eyebrow="Module 01 · Probability"
        title={zh ? "胜率实验室" : "Equity Lab"}
        description={
          zh
            ? "精确枚举与独立蒙特卡洛并行运行。胜率定义为 P(胜) + 0.5 × P(平)。"
            : "Exact enumeration and independent Monte Carlo run side by side. Equity is P(win) + 0.5 × P(tie)."
        }
        badge="ENGINE-SOURCED"
      />
      <div className="grid gap-5 xl:grid-cols-[310px_minmax(420px,1fr)_310px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "牌局状态" : "Card state"}</CardTitle>
              <CardDescription>
                {zh
                  ? "选择区域，然后从 52 张牌中点击。"
                  : "Choose a zone, then click from the 52-card deck."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {(["hero", "villain", "board"] as Zone[]).map((name) => {
                const cards =
                  name === "hero" ? hero : name === "villain" ? villain : board;
                return (
                  <div
                    key={name}
                    className={cn(
                      "rounded-xl border p-3 transition",
                      zone === name
                        ? "border-primary bg-primary/5"
                        : "bg-muted/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setZone(name)}
                      className="font-data mb-2 block w-full rounded text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {name} ·{" "}
                      {name === "board"
                        ? `${cards.length}/5`
                        : `${cards.length}/2`}
                    </button>
                    <span className="flex min-h-14 gap-1.5">
                      {cards.map((card) => (
                        <PokerCard
                          key={card}
                          card={card}
                          compact
                          onClick={() =>
                            name === "hero"
                              ? setHero(hero.filter((v) => v !== card))
                              : name === "villain"
                                ? setVillain(villain.filter((v) => v !== card))
                                : setBoard(board.filter((v) => v !== card))
                          }
                        />
                      ))}
                    </span>
                  </div>
                );
              })}
              <CardSelector
                selected={selected}
                onSelect={chooseCard}
                label={zh ? "52 张牌选择器" : "52-card selector"}
              />
              <Button variant="outline" onClick={reset}>
                <RotateCcw data-icon="inline-start" />
                {zh ? "清空牌面" : "Clear cards"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "交互牌桌" : "Interactive table"}</CardTitle>
              <CardDescription>
                {zh
                  ? "已用牌会在选择器中自动阻断。"
                  : "Used cards are blocked automatically at the domain boundary."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PokerTable hero={hero} villain={villain} board={board} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {zh ? "蒙特卡洛收敛" : "Monte Carlo convergence"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "阴影为逐步 95% 置信带，虚线为精确胜率。"
                  : "The band is the running 95% CI; the dashed line is exact equity."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monteCarlo.data?.convergence ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={monteCarlo.data.convergence}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ciBand" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0"
                            stopColor="var(--chart-1)"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="1"
                            stopColor="var(--chart-1)"
                            stopOpacity={0.02}
                          />
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
                        domain={["dataMin - 0.04", "dataMax + 0.04"]}
                        tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
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
                        formatter={(v) => percent(Number(v))}
                      />
                      <Area
                        type="monotone"
                        dataKey="ci_high"
                        stroke="none"
                        fill="url(#ciBand)"
                      />
                      <Area
                        type="monotone"
                        dataKey="ci_low"
                        stroke="none"
                        fill="var(--card)"
                      />
                      <Line
                        type="monotone"
                        dataKey="estimate"
                        stroke="var(--chart-1)"
                        dot={false}
                        isAnimationActive={false}
                      />
                      {exact.data ? (
                        <ReferenceLine
                          y={exact.data.equity}
                          stroke="var(--chart-2)"
                          strokeDasharray="5 5"
                        />
                      ) : null}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  {zh
                    ? "运行计算后显示真实轨迹。"
                    : "Run the calculation to reveal the real path."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "运行参数" : "Run parameters"}</CardTitle>
              <CardDescription>
                {zh
                  ? "相同种子复现实验。"
                  : "The same seed reproduces the experiment."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                {zh ? "样本数" : "Samples"}
                <Select
                  value={String(samples)}
                  onValueChange={(value) => setSamples(Number(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[10000, 50000, 100000, 500000].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                Seed
                <input
                  className="font-data h-9 rounded-lg border bg-background px-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                />
              </label>
              <Button
                size="lg"
                onClick={() => run()}
                disabled={
                  exact.isPending ||
                  monteCarlo.isPending ||
                  hero.length !== 2 ||
                  villain.length !== 2 ||
                  ![0, 3, 4, 5].includes(board.length)
                }
              >
                <Calculator data-icon="inline-start" />
                {exact.isPending || monteCarlo.isPending ? (
                  <LoadingLabel>{zh ? "正在计算" : "Calculating"}</LoadingLabel>
                ) : zh ? (
                  "计算胜率"
                ) : (
                  "Calculate equity"
                )}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "结果" : "Results"}</CardTitle>
              <CardDescription>{exact.data?.engine ?? "—"}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-5">
              {exact.data ? (
                <>
                  <Metric
                    label="Exact equity"
                    value={percent(exact.data.equity)}
                    accent="primary"
                    detail={`${exact.data.states?.toLocaleString()} states`}
                  />
                  <Metric label="Runtime" value={ms(exact.data.runtime_ms)} />
                  <Metric
                    label="Win"
                    value={percent(exact.data.win)}
                    accent="success"
                  />
                  <Metric label="Tie" value={percent(exact.data.tie)} />
                  <Metric
                    label="Lose"
                    value={percent(exact.data.lose)}
                    accent="danger"
                  />
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">
                  {zh ? "尚无结果。" : "No result yet."}
                </p>
              )}
            </CardContent>
          </Card>
          {monteCarlo.data ? (
            <Card>
              <CardHeader>
                <CardTitle>Monte Carlo</CardTitle>
                <CardDescription>seed {monteCarlo.data.seed}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-5">
                <Metric
                  label="Estimate"
                  value={percent(monteCarlo.data.equity)}
                />
                <Metric
                  label="95% CI"
                  value={`${percent(monteCarlo.data.ci_low ?? 0, 1)}–${percent(monteCarlo.data.ci_high ?? 0, 1)}`}
                />
                <Metric
                  label="Std. error"
                  value={percent(monteCarlo.data.standard_error ?? 0, 3)}
                />
                <Metric
                  label="Runtime"
                  value={ms(monteCarlo.data.runtime_ms)}
                />
              </CardContent>
            </Card>
          ) : null}
          {error ? <ErrorAlert message={error.message} /> : null}
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>
            {zh ? "条件转牌探索器" : "Conditional turn explorer"}
          </CardTitle>
          <CardDescription>
            {zh
              ? "每格是 P(胜率 | 指定转牌)。点击任意合法牌会更新牌桌与结果。"
              : "Each cell is hero equity conditional on that turn. Click a legal card to update the table and results."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid min-w-[620px] grid-cols-13 gap-1 overflow-x-auto">
            {suits.flatMap((suit) =>
              ranks.map((rank) => {
                const card = `${rank}${suit}`;
                const value = turnMap.data?.turns.find(
                  (row) => row.card === card,
                );
                const blocked = selected.includes(card);
                return (
                  <button
                    key={card}
                    type="button"
                    disabled={!value || blocked}
                    onClick={() => applyTurn(card)}
                    className={cn(
                      "font-data flex h-12 flex-col items-center justify-center rounded-md border text-[9px] transition focus-visible:outline-2 focus-visible:outline-ring",
                      blocked
                        ? "bg-muted opacity-20"
                        : value
                          ? "hover:-translate-y-0.5 hover:border-primary"
                          : "bg-muted/30 text-muted-foreground",
                    )}
                    style={
                      value
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--felt) ${Math.round(value.equity * 85)}%, var(--card))`,
                          }
                        : undefined
                    }
                  >
                    <span>{card}</span>
                    <span>{value ? percent(value.equity, 1) : "—"}</span>
                  </button>
                );
              }),
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
