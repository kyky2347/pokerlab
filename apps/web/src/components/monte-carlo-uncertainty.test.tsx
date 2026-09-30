import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MonteCarloUncertainty } from "./monte-carlo-uncertainty";
import type { EquityResult } from "@/lib/types";
import { checkpointInterval, monteCarloCsvRows } from "@/lib/monte-carlo";

const result: EquityResult = {
  equity: 0.5,
  win: 0,
  tie: 1,
  lose: 0,
  method: "monte_carlo",
  samples: 1,
  seed: 7,
  engine: "Python reference",
  runtime_ms: 1,
  standard_error: null,
  sample_variance: null,
  ci_low: 0,
  ci_high: 1,
  confidence_level: 0.95,
  confidence_method: "hoeffding_v1",
  confidence_scope: "pointwise_fixed_n",
  experiment_id: "test-experiment",
  convergence: [{ samples: 1, estimate: 0.5, ci_low: 0, ci_high: 1 }],
};

afterEach(cleanup);

describe("Monte Carlo uncertainty explanation", () => {
  it("reports server bounds, their method, and the stopping limitation in English", () => {
    render(<MonteCarloUncertainty result={result} zh={false} />);
    expect(
      screen.getByRole("note", { name: "Monte Carlo uncertainty" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0.00% – 100.00%")).toBeInTheDocument();
    expect(
      screen.getByText("95% Hoeffding interval (pointwise)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Not a simultaneous band or an early-stopping guarantee/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/about#monte-carlo",
    );
  });
  it("provides the same interpretation and method link in Chinese", () => {
    render(<MonteCarloUncertainty result={result} zh />);
    expect(
      screen.getByRole("note", { name: "蒙特卡洛不确定性" }),
    ).toBeInTheDocument();
    expect(screen.getByText("95% Hoeffding 区间（逐点）")).toBeInTheDocument();
    expect(screen.getByText(/不是整条轨迹的同时置信带/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "了解区间与限制" }),
    ).toBeInTheDocument();
  });
  it.each([
    { confidence_method: undefined },
    { confidence_method: "future_method" },
    { confidence_scope: undefined },
    { confidence_level: 0.9 },
  ])(
    "does not relabel legacy or unknown metadata as the current method: %j",
    (metadata) => {
      render(
        <MonteCarloUncertainty
          result={{ ...result, ...metadata }}
          zh={false}
        />,
      );
      expect(
        screen.getByText("Interval method unconfirmed"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("95% Hoeffding interval (pointwise)"),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    { ci_low: undefined },
    { ci_high: Number.NaN },
    { ci_low: 0.8, ci_high: 0.2 },
  ])("never fabricates missing or malformed bounds: %j", (bounds) => {
    render(
      <MonteCarloUncertainty result={{ ...result, ...bounds }} zh={false} />,
    );
    expect(screen.getByText("No valid interval reported")).toBeInTheDocument();
    expect(screen.queryByText("0.00% – 0.00%")).not.toBeInTheDocument();
  });
});

describe("convergence exports", () => {
  it("plots the server interval without extending its lower edge to zero", () => {
    expect(
      checkpointInterval({
        samples: 100,
        estimate: 0.54,
        ci_low: 0.4041898484,
        ci_high: 0.6758101516,
      }),
    ).toEqual([0.4041898484, 0.6758101516]);
  });
  it("preserves core values and uncertainty metadata on every checkpoint row", () => {
    const rows = monteCarloCsvRows({
      ...result,
      convergence: [...result.convergence!, ...result.convergence!],
    });
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toEqual({
        samples: 1,
        estimate: 0.5,
        ci_low: 0,
        ci_high: 1,
        experiment_id: "test-experiment",
        seed: 7,
        total_samples: 1,
        engine: "Python reference",
        confidence_level: 0.95,
        confidence_method: "hoeffding_v1",
        confidence_scope: "pointwise_fixed_n",
      });
  });
  it("does not invent metadata for old results or invent checkpoints", () => {
    const legacy = {
      ...result,
      confidence_method: undefined,
      confidence_level: undefined,
      confidence_scope: undefined,
    };
    expect(monteCarloCsvRows(legacy)[0]).toMatchObject({
      confidence_method: "",
      confidence_level: "",
      confidence_scope: "",
    });
    expect(monteCarloCsvRows({ ...result, convergence: undefined })).toEqual(
      [],
    );
  });
});
