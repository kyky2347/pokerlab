export type AgentResult = {
  episodes: number;
  seed: number;
  agents: Array<{
    agent: string;
    average_ev: number;
    decision_regret: number;
    variance: number;
    call_frequency: number;
    standard_error: number;
    ci_low: number;
    ci_high: number;
  }>;
  benchmark_version: string;
  confidence_level: number;
  methodology: {
    units: string;
    scenario_distribution: string;
    shared_scenarios: boolean;
    ev_formula: string;
    pot_definition: string;
    policies: Record<string, string>;
    confidence_method: string;
    limitations: string;
  };
  runtime_ms: number;
  scope: string;
  experiment_id: string;
};

export const policyCopy: Record<
  string,
  { en: string; zh: string; description: string; descriptionZh: string }
> = {
  RandomAgent: {
    en: "Random",
    zh: "随机策略",
    description: "Calls with probability 50%.",
    descriptionZh: "以 50% 概率跟注。",
  },
  TightThresholdAgent: {
    en: "Tight threshold",
    zh: "保守阈值策略",
    description: "Requires 4 percentage points more equity than pot odds.",
    descriptionZh: "要求胜率比底池赔率阈值高 4 个百分点。",
  },
  PotOddsAgent: {
    en: "Pot odds (oracle)",
    zh: "底池赔率（已知胜率）",
    description: "Calls when EV ≥ 0, using the generated true equity.",
    descriptionZh: "知道生成的真实胜率，EV ≥ 0 时跟注。",
  },
  SoftmaxAgent: {
    en: "Softmax",
    zh: "Softmax 概率策略",
    description: "Fixed logistic call probability. No learning or CFR.",
    descriptionZh: "固定逻辑函数决定跟注概率，不进行学习或 CFR 训练。",
  },
};

export function parseResearchSeed(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : null;
}

export function agentCsvRows(result: AgentResult) {
  return result.agents.map((agent) => ({
    ...agent,
    experiment_id: result.experiment_id,
    seed: result.seed,
    episodes: result.episodes,
    benchmark_version: result.benchmark_version,
    confidence_level: result.confidence_level,
    units: result.methodology.units,
    policy: result.methodology.policies[agent.agent],
    scenario_distribution: result.methodology.scenario_distribution,
    shared_scenarios: String(result.methodology.shared_scenarios),
    ev_formula: result.methodology.ev_formula,
    pot_definition: result.methodology.pot_definition,
    confidence_method: result.methodology.confidence_method,
    limitations: result.methodology.limitations,
  }));
}

export function serializeCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return [
    keys.map(cell).join(","),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}
