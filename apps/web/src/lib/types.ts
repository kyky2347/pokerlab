export type EquityResult = {
  equity: number;
  win: number;
  tie: number;
  lose: number;
  method: string;
  states?: number;
  samples?: number;
  sample_variance?: number;
  standard_error?: number;
  ci_low?: number;
  ci_high?: number;
  seed?: number;
  runtime_ms: number;
  engine: string;
  experiment_id?: string;
  convergence?: Array<{
    samples: number;
    estimate: number;
    ci_low: number;
    ci_high: number;
  }>;
};
export type RangeStatistics = {
  hand_classes: number;
  physical_combos: number;
  range_percent: number;
  blocker_adjusted_combos: number;
  weighted_combos: number;
};
export type RangeResult = {
  hero_equity: number;
  villain_equity: number;
  win: number;
  tie: number;
  lose: number;
  valid_combo_pairs: number;
  weighted_combo_pair_mass: number;
  evaluated_states: number;
  method: string;
  seed: number;
  runtime_ms: number;
  engine: string;
  hero_statistics: RangeStatistics;
  villain_statistics: RangeStatistics;
};
export type BayesianResult = {
  prior: { alpha: number; beta: number; mean: number };
  posterior: {
    alpha: number;
    beta: number;
    mean: number;
    credible_level: number;
    credible_interval: [number, number];
  };
  density: Array<{ p: number; prior: number; posterior: number }>;
  runtime_ms: number;
  experiment_id: string;
};
