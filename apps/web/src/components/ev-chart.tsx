"use client";

import { useId } from "react";
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

import { percent } from "@/components/lab-ui";

export function EVChart({
  curve,
  requiredEquity,
  heroEquity,
  zh,
}: {
  curve: Array<{ equity: number; ev: number }>;
  requiredEquity: number;
  heroEquity: number;
  zh: boolean;
}) {
  const captionId = useId();
  return (
    <figure
      aria-label={zh ? "跟注 EV 与胜率" : "Call EV against equity"}
      aria-describedby={captionId}
    >
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              type="number"
              dataKey="equity"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(value) => `${value * 100}%`}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={52}
              tickFormatter={(value) => `$${value}`}
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
              labelFormatter={(value) =>
                `${zh ? "胜率" : "Equity"}: ${percent(Number(value))}`
              }
              formatter={(value) => [
                `$${Number(value).toFixed(2)}`,
                zh ? "跟注 EV" : "Call EV",
              ]}
            />
            <Area
              type="linear"
              dataKey="ev"
              stroke="var(--foreground)"
              fill="var(--muted-foreground)"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <ReferenceLine y={0} stroke="var(--chart-3)" />
            <ReferenceLine x={heroEquity} stroke="var(--chart-2)" />
            <ReferenceLine
              x={requiredEquity}
              stroke="var(--chart-1)"
              strokeDasharray="5 5"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption
        id={captionId}
        className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 shrink-0 border-t-2"
            style={{ borderTopColor: "var(--chart-2)" }}
          />
          {zh ? "英雄胜率（实线）" : "Hero equity (solid)"}:{" "}
          {percent(heroEquity)}
        </span>{" "}
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 shrink-0 border-t-2 border-dashed"
            style={{ borderTopColor: "var(--chart-1)" }}
          />
          {zh ? "盈亏平衡（虚线）" : "Break-even (dashed)"}:{" "}
          {percent(requiredEquity)}
        </span>
      </figcaption>
    </figure>
  );
}
