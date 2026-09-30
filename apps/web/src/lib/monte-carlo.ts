import type { EquityResult } from "./types";

// Recharts range areas take both server endpoints, not a fill from zero.
export function checkpointInterval(
  point: NonNullable<EquityResult["convergence"]>[number],
): [number, number] {
  return [point.ci_low, point.ci_high];
}

export function monteCarloCsvRows(result: EquityResult) {
  return (result.convergence ?? []).map((point) => ({
    ...point,
    experiment_id: result.experiment_id ?? "",
    seed: result.seed ?? "",
    total_samples: result.samples ?? "",
    engine: result.engine,
    confidence_level: result.confidence_level ?? "",
    confidence_method: result.confidence_method ?? "",
    confidence_scope: result.confidence_scope ?? "",
  }));
}
