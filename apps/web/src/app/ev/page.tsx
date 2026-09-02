"use client";

import { useQuery } from "@tanstack/react-query";
import { Equal, Sigma } from "lucide-react";
import { useState } from "react";
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

import { ErrorAlert, Metric, PageHeader, percent } from "@/components/lab-ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";

type EVResult = {
  final_pot_after_call: number;
  required_equity: number;
  pot_odds: number;
  incremental_call_ev: number;
  decision: "call" | "fold" | "break_even";
  formula: string;
  curve: Array<{ equity: number; ev: number }>;
};
function MoneySlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-3">
      <span className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-data text-foreground">
          {suffix === "$" ? "$" : ""}
          {value.toFixed(suffix === "%" ? 1 : 0)}
          {suffix === "%" ? "%" : ""}
        </span>
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
      />
    </label>
  );
}

export default function EVLab() {
  const zh = useCopy(false, true);
  const [pot, setPot] = useState(100);
  const [bet, setBet] = useState(50);
  const [call, setCall] = useState(50);
  const [equity, setEquity] = useState(30);
  const [stack, setStack] = useState(200);
  const result = useQuery({
    queryKey: ["ev", pot, bet, call, equity, stack],
    queryFn: () =>
      postJson<EVResult>("/ev/calculate", {
        pot,
        opponent_bet: bet,
        call_size: call,
        hero_equity: equity / 100,
        effective_stack: stack,
      }),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Module 04 · Decision theory"
        title={zh ? "EV 实验室" : "EV Lab"}
        description={
          zh
            ? "改变底池、下注与胜率，立即看到增量跟注 EV 及盈亏平衡边界。"
            : "Change the pot, bet, and equity to see incremental call EV and the break-even boundary update from the API."
        }
        badge="CLEAR CONVENTIONS"
      />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{zh ? "决策输入" : "Decision inputs"}</CardTitle>
            <CardDescription>
              {zh
                ? "底池指对手下注前；最终底池包含英雄跟注。"
                : "Pot is before villain's bet; final pot includes hero's call."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-7">
            <MoneySlider
              label={zh ? "当前底池" : "Pot before bet"}
              value={pot}
              min={10}
              max={500}
              step={5}
              suffix="$"
              onChange={setPot}
            />
            <MoneySlider
              label={zh ? "对手下注" : "Opponent bet"}
              value={bet}
              min={0}
              max={Math.min(stack, 300)}
              step={5}
              suffix="$"
              onChange={(value) => {
                setBet(value);
                setCall(value);
              }}
            />
            <MoneySlider
              label={zh ? "跟注额" : "Call size"}
              value={call}
              min={0}
              max={stack}
              step={5}
              suffix="$"
              onChange={setCall}
            />
            <MoneySlider
              label={zh ? "英雄胜率" : "Hero equity"}
              value={equity}
              min={0}
              max={100}
              step={0.5}
              suffix="%"
              onChange={setEquity}
            />
            <MoneySlider
              label={zh ? "有效筹码" : "Effective stack"}
              value={stack}
              min={10}
              max={1000}
              step={10}
              suffix="$"
              onChange={(value) => {
                setStack(value);
                if (call > value) setCall(value);
              }}
            />
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "跟注决策" : "Call decision"}</CardTitle>
              <CardDescription>
                {result.data?.formula ??
                  "EV(call) = equity × final pot after call − call size"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Required equity"
                    value={percent(result.data.required_equity)}
                  />
                  <Metric label="Hero equity" value={percent(equity / 100)} />
                  <Metric
                    label="EV(call)"
                    value={`${result.data.incremental_call_ev >= 0 ? "+" : "−"}$${Math.abs(result.data.incremental_call_ev).toFixed(2)}`}
                    accent={
                      result.data.incremental_call_ev > 0
                        ? "success"
                        : result.data.incremental_call_ev < 0
                          ? "danger"
                          : "primary"
                    }
                  />
                  <div>
                    <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Decision
                    </p>
                    <Badge
                      className="mt-2"
                      variant={
                        result.data.decision === "call"
                          ? "default"
                          : result.data.decision === "fold"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {result.data.decision.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Calculating…</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {zh ? "EV 对胜率" : "EV against hero equity"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "红色区域为负 EV，绿色为正 EV；虚线是盈亏平衡点。"
                  : "Negative EV sits below zero; the dashed line marks break-even equity."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data ? (
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={result.data.curve}
                      margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
                    >
                      <defs>
                        <linearGradient
                          id="evPositive"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0"
                            stopColor="var(--chart-2)"
                            stopOpacity={0.45}
                          />
                          <stop
                            offset="1"
                            stopColor="var(--chart-2)"
                            stopOpacity={0.03}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="equity"
                        tickFormatter={(v) => `${Math.round(v * 100)}%`}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
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
                          `${(Number(v) * 100).toFixed(0)}% equity`
                        }
                        formatter={(v) => `$${Number(v).toFixed(2)}`}
                      />
                      <ReferenceLine y={0} stroke="var(--chart-3)" />
                      <ReferenceLine
                        x={result.data.required_equity}
                        stroke="var(--chart-1)"
                        strokeDasharray="5 5"
                        label={{
                          value: "break-even",
                          fill: "var(--muted-foreground)",
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine x={equity / 100} stroke="var(--chart-2)" />
                      <Area
                        type="monotone"
                        dataKey="ev"
                        stroke="var(--chart-2)"
                        fill="url(#evPositive)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Sigma className="text-primary" />
              <CardTitle>
                {zh ? "约定与推导" : "Convention and derivation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-muted p-4">
                <p className="font-data text-xs text-muted-foreground">
                  FINAL POT
                </p>
                <p className="font-data mt-2 text-lg">P + B + C</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="font-data text-xs text-muted-foreground">
                  BREAK-EVEN
                </p>
                <p className="font-data mt-2 text-lg">C / (P + B + C)</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="font-data text-xs text-muted-foreground">
                  CALL EV
                </p>
                <p className="font-data mt-2 text-lg">e(P + B + C) − C</p>
              </div>
              <p className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
                <Equal />
                {zh
                  ? "这与 e(P+B) − (1−e)C 完全等价。沉没成本不进入增量决策。"
                  : "Equivalent to e(P+B) − (1−e)C. Sunk contributions are excluded from the incremental decision."}
              </p>
            </CardContent>
          </Card>
          {result.error ? <ErrorAlert message={result.error.message} /> : null}
        </div>
      </div>
    </div>
  );
}
