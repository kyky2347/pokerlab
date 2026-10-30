"use client";

import { useQuery } from "@tanstack/react-query";
import { Equal, Sigma } from "lucide-react";
import { useState } from "react";

import { EVChart } from "@/components/ev-chart";
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
        eyebrow={zh ? "模块 04 · 决策理论" : "Module 04 · Decision theory"}
        title={zh ? "EV 实验室" : "EV Lab"}
        description={
          zh
            ? "改变底池、下注与胜率，立即看到增量跟注 EV 及盈亏平衡边界。"
            : "Change the pot, bet, and equity to see incremental call EV and the break-even boundary update from the API."
        }
        badge={zh ? "明确计算约定" : "CLEAR CONVENTIONS"}
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
              max={Math.min(stack, bet)}
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
                const nextBet = Math.min(bet, value);
                setBet(nextBet);
                setCall(Math.min(call, nextBet));
              }}
            />
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{zh ? "跟注决策" : "Call decision"}</CardTitle>
              <CardDescription>
                {zh
                  ? "跟注 EV = 胜率 × 跟注后最终底池 − 跟注额"
                  : (result.data?.formula ??
                    "EV(call) = equity × final pot after call − call size")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label={zh ? "盈亏平衡胜率" : "Required equity"}
                    value={percent(result.data.required_equity)}
                  />
                  <Metric
                    label={zh ? "英雄胜率" : "Hero equity"}
                    value={percent(equity / 100)}
                  />
                  <Metric
                    label={zh ? "跟注 EV" : "EV(call)"}
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
                      {zh ? "决策" : "Decision"}
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
                      {zh
                        ? {
                            call: "跟注",
                            fold: "弃牌",
                            break_even: "盈亏平衡",
                          }[result.data.decision]
                        : {
                            call: "Call",
                            fold: "Fold",
                            break_even: "Break-even",
                          }[result.data.decision]}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {result.error
                    ? zh
                      ? "计算失败，请查看下方错误信息。"
                      : "Calculation failed. See the error below."
                    : zh
                      ? "计算中…"
                      : "Calculating…"}
                </p>
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
                  ? "零线上方为正 EV，下方为负 EV。实线标记英雄胜率，虚线标记盈亏平衡胜率；两者相等时重合。"
                  : "EV is positive above zero and negative below it. Solid marks hero equity; dashed marks break-even. The markers overlap when equal."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data ? (
                <EVChart
                  curve={result.data.curve}
                  requiredEquity={result.data.required_equity}
                  heroEquity={equity / 100}
                  zh={zh}
                />
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
                  {zh ? "最终底池" : "FINAL POT"}
                </p>
                <p className="font-data mt-2 text-lg">P + B + C</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="font-data text-xs text-muted-foreground">
                  {zh ? "盈亏平衡" : "BREAK-EVEN"}
                </p>
                <p className="font-data mt-2 text-lg">C / (P + B + C)</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="font-data text-xs text-muted-foreground">
                  {zh ? "跟注 EV" : "CALL EV"}
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
