import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BayesianDensity } from "./bayesian-density";
import { bayesianChartData } from "@/lib/bayesian";
import type { BayesianDistribution } from "@/lib/types";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  ComposedChart: ({
    children,
    data,
  }: {
    children: ReactNode;
    data: unknown;
  }) => (
    <div data-testid="chart" data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  XAxis: ({ type, domain }: { type: string; domain: number[] }) => (
    <span
      data-testid="x-axis"
      data-type={type}
      data-domain={JSON.stringify(domain)}
    />
  ),
  YAxis: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Tooltip: () => null,
  Area: ({ type, dataKey }: { type: string; dataKey: string }) => (
    <span data-testid="posterior" data-type={type} data-key={dataKey} />
  ),
  Line: ({
    type,
    dataKey,
    strokeDasharray,
  }: {
    type: string;
    dataKey: string;
    strokeDasharray: string;
  }) => (
    <span
      data-testid="prior"
      data-type={type}
      data-key={dataKey}
      data-dash={strokeDasharray}
    />
  ),
}));

// Analytic Beta(1, 1) fixture: unit density on the entire unit interval.
const distribution: BayesianDistribution = {
  method: "beta-cdf-bins-v1",
  bin_count: 200,
  domain: [0, 1],
  density_units: "probability per unit p",
  limitations: "Finite bin resolution",
  bins: Array.from({ length: 200 }, (_, i) => ({
    left: i / 200,
    right: (i + 1) / 200,
    prior_mass: 0.005,
    posterior_mass: 0.005,
    prior_density: 1,
    posterior_density: 1,
  })),
};
afterEach(cleanup);

describe("Bayesian distribution rendering", () => {
  it("preserves server densities and closes the final step without altering bins", () => {
    const original = structuredClone(distribution);
    const data = bayesianChartData(distribution)!;
    expect(data).toHaveLength(201);
    for (let i = 0; i < 200; i++)
      expect(data[i]).toEqual({ ...distribution.bins[i], p: i / 200 });
    expect(data.at(-1)).toEqual({ ...distribution.bins[199], p: 1 });
    expect(distribution).toEqual(original);
  });
  it("uses numeric full-support axes, steps, and redundant line styling", () => {
    render(<BayesianDensity distribution={distribution} zh={false} />);
    expect(screen.getByTestId("x-axis")).toHaveAttribute("data-type", "number");
    expect(screen.getByTestId("x-axis")).toHaveAttribute(
      "data-domain",
      "[0,1]",
    );
    expect(screen.getByTestId("posterior")).toHaveAttribute(
      "data-type",
      "stepAfter",
    );
    expect(screen.getByTestId("posterior")).toHaveAttribute(
      "data-key",
      "posterior_density",
    );
    expect(screen.getByTestId("prior")).toHaveAttribute(
      "data-type",
      "stepAfter",
    );
    expect(screen.getByTestId("prior")).toHaveAttribute("data-dash", "5 3");
    expect(JSON.parse(screen.getByTestId("chart").dataset.points!)).toEqual(
      bayesianChartData(distribution),
    );
  });
  it.each([false, true])(
    "explains units, resolution, and interval independence (zh=%s)",
    (zh) => {
      render(<BayesianDensity distribution={distribution} zh={zh} />);
      expect(screen.getByRole("figure")).toHaveAccessibleName(
        zh ? "贝叶斯区间平均密度" : "Bayesian bin-average density",
      );
      expect(
        screen.getByText(
          zh ? /面积而非高度表示概率/ : /area, not height, is probability/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(zh ? /可信区间独立计算/ : /computed independently/),
      ).toBeInTheDocument();
    },
  );
  it.each([undefined, { ...distribution, method: "unknown" }])(
    "does not relabel legacy or unknown results",
    (value) => {
      render(<BayesianDensity distribution={value} zh={false} />);
      expect(screen.getByRole("status")).toHaveTextContent(
        /Legacy point samples can miss narrow peaks/,
      );
      expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    },
  );
  it("offers a Chinese recovery message for old API results", () => {
    render(<BayesianDensity zh />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "请更新 API 后重新计算",
    );
  });
  it.each([
    { prior_mass: Number.NaN },
    { posterior_density: Infinity },
    { prior_density: -1 },
    { left: 0.5 },
    { right: 0.8 },
    { posterior_mass: 2 },
    { prior_density: undefined },
  ])("refuses malformed bins instead of inventing a curve: %j", (change) => {
    const broken = structuredClone(distribution);
    Object.assign(broken.bins[10], change);
    expect(bayesianChartData(broken)).toBeNull();
  });
  it.each([
    { bins: [] },
    { bin_count: 100 },
    { domain: [0.1, 1] as [number, number] },
  ])("refuses incompatible bin metadata: %j", (change) => {
    expect(bayesianChartData({ ...distribution, ...change })).toBeNull();
  });
  it.each([
    { bins: "x".repeat(200) },
    { bins: null },
    { domain: "01" },
    { domain: [0, 1, 2] },
    { bins: distribution.bins.map((bin, i) => (i === 0 ? null : bin)) },
    { bins: distribution.bins.map((bin, i) => (i === 10 ? null : bin)) },
  ])("handles malformed JSON shapes without throwing: %j", (change) => {
    const untrusted = {
      ...distribution,
      ...change,
    } as unknown as BayesianDistribution;
    expect(bayesianChartData(untrusted)).toBeNull();
  });
});
