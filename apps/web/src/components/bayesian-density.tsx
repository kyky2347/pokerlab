"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { bayesianChartData } from "@/lib/bayesian";
import type { BayesianDistribution } from "@/lib/types";

export function BayesianDensity({
  distribution,
  zh,
}: {
  distribution?: BayesianDistribution;
  zh: boolean;
}) {
  const data = bayesianChartData(distribution);
  if (!data) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {zh
          ? "区间分布不可用，请更新 API 后重新计算。旧版采样曲线可能遗漏窄峰，不在此重绘。"
          : "Binned distribution unavailable. Update the API and rerun. Legacy point samples can miss narrow peaks and are not replotted here."}
      </p>
    );
  }
  return (
    <figure
      aria-label={zh ? "贝叶斯区间平均密度" : "Bayesian bin-average density"}
      className="flex flex-col gap-4"
    >
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            accessibilityLayer
            margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="p"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(value) => `${value * 100}%`}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              stroke="var(--border)"
            />
            <YAxis
              domain={[0, "auto"]}
              width={44}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              stroke="var(--border)"
            />
            <Legend verticalAlign="top" height={36} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              labelFormatter={(_, payload) => {
                const bin = payload[0]?.payload;
                return bin
                  ? `p: ${(bin.left * 100).toFixed(1)}%–${(bin.right * 100).toFixed(1)}%`
                  : "";
              }}
              formatter={(value) => Number(value).toPrecision(4)}
            />
            <Area
              type="stepAfter"
              dataKey="posterior_density"
              name={zh ? "后验平均密度" : "Posterior density"}
              stroke="var(--chart-2)"
              fill="var(--chart-2)"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="prior_density"
              name={zh ? "先验平均密度" : "Prior density"}
              stroke="var(--chart-1)"
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm leading-relaxed text-muted-foreground">
        {zh
          ? "横轴为激进概率 p，纵轴为平均密度（可以大于 1）。200 个区间覆盖 0–100%，每格宽 0.5 个百分点；面积而非高度表示概率。格内峰形未分辨，极小尾部可能下溢；端点舍入不等于确定性。下方可信区间独立计算，不由图形估计。"
          : "X: aggression probability p. Y: average density (can exceed 1). 200 bins cover 0–100%, each 0.5 percentage points wide; area, not height, is probability. Within-bin peaks are unresolved; tiny tails may underflow. Endpoint rounding is not certainty. The credible interval below is computed independently, not estimated from the plot."}
      </figcaption>
    </figure>
  );
}
