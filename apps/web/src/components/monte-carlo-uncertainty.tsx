import Link from "next/link";

import { percent } from "@/components/lab-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { EquityResult } from "@/lib/types";

export function MonteCarloUncertainty({
  result,
  zh,
}: {
  result: EquityResult;
  zh: boolean;
}) {
  const knownMethod =
    result.confidence_method === "hoeffding_v1" &&
    result.confidence_level === 0.95 &&
    result.confidence_scope === "pointwise_fixed_n";
  const hasBounds =
    typeof result.ci_low === "number" &&
    typeof result.ci_high === "number" &&
    Number.isFinite(result.ci_low) &&
    Number.isFinite(result.ci_high) &&
    0 <= result.ci_low &&
    result.ci_low <= result.ci_high &&
    result.ci_high <= 1;

  return (
    <Alert
      role="note"
      aria-label={zh ? "蒙特卡洛不确定性" : "Monte Carlo uncertainty"}
    >
      <AlertTitle>
        {knownMethod
          ? zh
            ? "95% Hoeffding 区间（逐点）"
            : "95% Hoeffding interval (pointwise)"
          : zh
            ? "区间方法未确认"
            : "Interval method unconfirmed"}
      </AlertTitle>
      <AlertDescription>
        <p className="font-data">
          {hasBounds
            ? `${percent(result.ci_low!, 2)} – ${percent(result.ci_high!, 2)}`
            : zh
              ? "未提供有效区间"
              : "No valid interval reported"}
        </p>
        <p>
          {knownMethod
            ? zh
              ? "独立抽样、固定样本量下的保守区间，不是整条轨迹的同时置信带，也不能用作提前停止的保证。"
              : "A conservative bound for independent draws at a fixed sample count. Not a simultaneous band or an early-stopping guarantee."
            : zh
              ? "此响应未报告当前区间方法，请检查 API 版本；不要将旧结果解释为 Hoeffding 区间。"
              : "This response does not identify the current interval method. Check the API version; do not interpret older results as Hoeffding intervals."}
        </p>
        <Link href="/about#monte-carlo">
          {zh ? "了解区间与限制" : "Understand the interval and its limits"}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
