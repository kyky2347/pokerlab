"use client";

import { useQuery } from "@tanstack/react-query";
import { Equal, RotateCcw, Sigma } from "lucide-react";
import { useEffect, useState } from "react";

import { EVChart } from "@/components/ev-chart";
import { ErrorAlert, Metric, PageHeader, percent } from "@/components/lab-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { postJson } from "@/lib/api";
import { useCopy } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  const inputKey = JSON.stringify([pot, bet, call, equity, stack]);
  const [settledKey, setSettledKey] = useState(inputKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledKey(inputKey), 150);
    return () => window.clearTimeout(timer);
  }, [inputKey]);
  const ready = inputKey === settledKey;
  const result = useQuery({
    // Switch observers immediately to cancel obsolete reads. Only fetch once
    // edits settle; chart markers and API results must describe the same inputs.
    queryKey: ["ev", pot, bet, call, equity, stack],
    enabled: ready,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      postJson<EVResult>(
        "/ev/calculate",
        {
          pot,
          opponent_bet: bet,
          call_size: call,
          hero_equity: equity / 100,
          effective_stack: stack,
        },
        signal,
      ),
  });
  const busy =
    !ready || result.isPending || result.isFetching || result.isPaused;
  const data = !busy && result.isSuccess ? result.data : undefined;
  const error = !busy && result.isError ? result.error : null;
  const animatePlaceholder = busy && !result.isPaused;
  return (
    <div>
      <PageHeader
        eyebrow={zh ? "模块 04 · 决策理论" : "Module 04 · Decision theory"}
        title={zh ? "EV 实验室" : "EV Lab"}
        description={
          zh
            ? "改变底池、下注与胜率，查看由 API 更新的增量跟注 EV 及盈亏平衡边界。"
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
                  : (data?.formula ??
                    "EV(call) = equity × final pot after call − call size")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data ? (
                <div className="grid auto-rows-[minmax(56px,auto)] gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label={zh ? "盈亏平衡胜率" : "Required equity"}
                    value={percent(data.required_equity)}
                  />
                  <Metric
                    label={zh ? "英雄胜率" : "Hero equity"}
                    value={percent(equity / 100)}
                  />
                  <Metric
                    label={zh ? "跟注 EV" : "EV(call)"}
                    value={`${data.incremental_call_ev >= 0 ? "+" : "−"}$${Math.abs(data.incremental_call_ev).toFixed(2)}`}
                    accent={
                      data.incremental_call_ev > 0
                        ? "success"
                        : data.incremental_call_ev < 0
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
                        data.decision === "call"
                          ? "default"
                          : data.decision === "fold"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {zh
                        ? {
                            call: "跟注",
                            fold: "弃牌",
                            break_even: "盈亏平衡",
                          }[data.decision]
                        : {
                            call: "Call",
                            fold: "Fold",
                            break_even: "Break-even",
                          }[data.decision]}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className="grid auto-rows-[minmax(56px,auto)] gap-6 sm:grid-cols-2 xl:grid-cols-4"
                >
                  {[0, 1, 2, 3].map((slot) => (
                    <div key={slot}>
                      <Skeleton
                        className={cn(
                          "h-4 w-24 max-w-full",
                          !animatePlaceholder && "animate-none",
                        )}
                      />
                      <Skeleton
                        className={cn(
                          "mt-1 h-8 w-28 max-w-full sm:h-9",
                          !animatePlaceholder && "animate-none",
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 min-h-5 text-sm text-muted-foreground">
                {busy ? (
                  <p role="status">
                    {!ready
                      ? zh
                        ? "等待编辑完成…"
                        : "Waiting for edits to finish…"
                      : result.isPaused
                        ? zh
                          ? "当前离线，恢复连接后将继续计算。"
                          : "You are offline. Calculation will resume when you reconnect."
                        : zh
                          ? "正在计算 EV…"
                          : "Calculating EV…"}
                  </p>
                ) : null}
              </div>
              {error ? (
                <div className="flex flex-col gap-3">
                  <ErrorAlert
                    message={`${zh ? "无法计算 EV，请检查 API 服务后重试。" : "Could not calculate EV. Check the API service and retry."} ${error.message}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void result.refetch()}
                  >
                    <RotateCcw data-icon="inline-start" />
                    {zh ? "重试计算" : "Retry calculation"}
                  </Button>
                </div>
              ) : null}
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
            <CardContent aria-busy={busy}>
              {data ? (
                <EVChart
                  curve={data.curve}
                  requiredEquity={data.required_equity}
                  heroEquity={equity / 100}
                  zh={zh}
                />
              ) : (
                <div aria-hidden="true">
                  <Skeleton
                    className={cn(
                      "h-[380px] w-full",
                      !animatePlaceholder && "animate-none",
                    )}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <Skeleton
                      className={cn(
                        "h-4 w-44",
                        !animatePlaceholder && "animate-none",
                      )}
                    />
                    <Skeleton
                      className={cn(
                        "h-4 w-48",
                        !animatePlaceholder && "animate-none",
                      )}
                    />
                  </div>
                </div>
              )}
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
        </div>
      </div>
    </div>
  );
}
