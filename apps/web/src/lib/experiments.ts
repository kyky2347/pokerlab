export type ExperimentSummary = {
  id: string;
  experiment_type: string;
  seed: string | null;
  engine: string;
  runtime_ms: number;
  timestamp: string;
};

export type ExperimentPage = {
  experiments: ExperimentSummary[];
  next_cursor: string | null;
  database: string;
};

const experimentNames: Record<string, [string, string]> = {
  exact_equity: ["Exact equity", "精确胜率"],
  monte_carlo_equity: ["Monte Carlo equity", "蒙特卡洛胜率"],
  range_equity: ["Range equity", "范围胜率"],
  bayesian_opponent_model: ["Bayesian opponent model", "贝叶斯对手模型"],
  agent_comparison: ["Research policy comparison", "研究策略对比"],
};

export function experimentName(type: string, zh: boolean) {
  return experimentNames[type]?.[zh ? 1 : 0] ?? type.replaceAll("_", " ");
}

export function databaseLabel(database: string | undefined, zh: boolean) {
  if (database === "postgresql") return "PostgreSQL";
  if (database === "sqlite") return "SQLite";
  return zh ? "存储状态未确认" : "Storage unconfirmed";
}
