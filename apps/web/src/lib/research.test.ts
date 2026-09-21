import { describe, expect, it } from "vitest";

import {
  agentCsvRows,
  parseResearchSeed,
  policyCopy,
  serializeCsv,
  type AgentResult,
} from "./research";

describe("reproducible research inputs", () => {
  it.each(["0", "7", "20250902", "9007199254740991"])(
    "preserves seed %s exactly",
    (value) => {
      expect(parseResearchSeed(value)).toBe(Number(value));
    },
  );
  it.each([
    "",
    " ",
    "-1",
    "1.5",
    "1e3",
    "NaN",
    "Infinity",
    "9007199254740992",
    "9223372036854775807",
  ])("rejects unsafe seed %s", (value) => {
    expect(parseResearchSeed(value)).toBeNull();
  });
  it("describes real policies in both languages", () => {
    expect(Object.keys(policyCopy)).toEqual([
      "RandomAgent",
      "TightThresholdAgent",
      "PotOddsAgent",
      "SoftmaxAgent",
    ]);
    for (const policy of Object.values(policyCopy)) {
      expect(policy.en).toBeTruthy();
      expect(policy.zh).toBeTruthy();
      expect(policy.descriptionZh).toBeTruthy();
    }
    expect(policyCopy.SoftmaxAgent.description).toContain("No learning or CFR");
  });
});

describe("research exports", () => {
  it("escapes CSV quotes, commas, newlines, and Unicode without JSON backslash escapes", () => {
    expect(serializeCsv([{ label: '策略, "quoted"\nnext', value: 0 }])).toBe(
      '"label","value"\r\n"策略, ""quoted""\nnext","0"',
    );
    expect(serializeCsv([])).toBe("");
  });

  it("includes reproducibility and interpretation metadata on every CSV row", () => {
    const row = {
      agent: "RandomAgent",
      average_ev: 2,
      decision_regret: 1,
      variance: 3,
      call_frequency: 0.5,
      standard_error: 0.2,
      ci_low: 1.6,
      ci_high: 2.4,
    };
    const result: AgentResult = {
      episodes: 100,
      seed: 7,
      agents: [row, row],
      benchmark_version: "river-call-fold-v2",
      confidence_level: 0.95,
      runtime_ms: 1,
      scope: "test fixture",
      experiment_id: "test-id",
      methodology: {
        units: "chips",
        scenario_distribution: "test fixture",
        shared_scenarios: true,
        ev_formula: "test formula",
        pot_definition: "before bet",
        policies: { RandomAgent: "Call with probability 0.5" },
        confidence_method: "Student t",
        limitations: "Not poker matches",
      },
    };
    for (const exported of agentCsvRows(result)) {
      expect(exported).toMatchObject({
        ...row,
        experiment_id: "test-id",
        seed: 7,
        episodes: 100,
        benchmark_version: "river-call-fold-v2",
        confidence_level: 0.95,
        shared_scenarios: "true",
        policy: "Call with probability 0.5",
        confidence_method: "Student t",
        limitations: "Not poker matches",
      });
    }
  });
});
