import { cleanup, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EVChart } from "./ev-chart";

// jsdom has no layout. Supply dimensions, but keep the actual Recharts scales,
// axes, paths and reference-line rendering to catch category-axis regressions.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        {
          width: 600,
          height: 380,
        },
      ),
  };
});

afterEach(cleanup);

// API-shaped fixture: P=105, B=C=50. The exact threshold is between grid points.
const curve = Array.from({ length: 101 }, (_, index) => ({
  equity: index / 100,
  ev: (index / 100) * 205 - 50,
}));

function markerPositions(container: HTMLElement) {
  const lines = [
    ...container.querySelectorAll(".recharts-reference-line line"),
  ];
  expect(lines).toHaveLength(3);
  const [zero, hero, threshold] = lines;
  const left = Number(zero.getAttribute("x1"));
  const right = Number(zero.getAttribute("x2"));
  expect(right).toBeGreaterThan(left);
  for (const line of [hero, threshold]) {
    expect(line.getAttribute("x1")).toEqual(line.getAttribute("x2"));
    expect(Number(line.getAttribute("y1"))).not.toEqual(
      Number(line.getAttribute("y2")),
    );
  }
  return {
    hero: (Number(hero.getAttribute("x1")) - left) / (right - left),
    threshold: (Number(threshold.getAttribute("x1")) - left) / (right - left),
  };
}

describe("EV chart continuous coordinates", () => {
  it.each([0, 0.005, 0.305, 0.995, 1, 50 / 205])(
    "places hero equity %s and an off-grid threshold on the actual SVG axis",
    (heroEquity) => {
      const { container } = render(
        <EVChart
          curve={curve}
          requiredEquity={50 / 205}
          heroEquity={heroEquity}
          zh={false}
        />,
      );
      const positions = markerPositions(container);
      expect(positions.hero).toBeCloseTo(heroEquity, 10);
      expect(positions.threshold).toBeCloseTo(50 / 205, 10);
    },
  );

  it("keeps the zero-cost threshold and hero at the left endpoint", () => {
    const { container } = render(
      <EVChart
        curve={[
          { equity: 0, ev: 0 },
          { equity: 1, ev: 105 },
        ]}
        requiredEquity={0}
        heroEquity={0}
        zh={false}
      />,
    );
    expect(markerPositions(container)).toEqual({ hero: 0, threshold: 0 });
  });

  it("updates geometry after changing the inputs without retaining old markers", () => {
    const { container, rerender } = render(
      <EVChart
        curve={curve}
        requiredEquity={0.25}
        heroEquity={0.3}
        zh={false}
      />,
    );
    rerender(
      <EVChart
        curve={curve}
        requiredEquity={50 / 205}
        heroEquity={0.305}
        zh={false}
      />,
    );
    const positions = markerPositions(container);
    expect(positions.hero).toBeCloseTo(0.305, 10);
    expect(positions.threshold).toBeCloseTo(50 / 205, 10);
  });

  it.each([false, true])(
    "names the figure and explains markers without relying on color (zh=%s)",
    (zh) => {
      const original = structuredClone(curve);
      render(
        <EVChart
          curve={curve}
          requiredEquity={50 / 205}
          heroEquity={0.305}
          zh={zh}
        />,
      );
      const figure = screen.getByRole("figure", {
        name: zh ? "跟注 EV 与胜率" : "Call EV against equity",
      });
      expect(figure).toHaveAccessibleDescription(
        zh
          ? "英雄胜率（实线）: 30.50% 盈亏平衡（虚线）: 24.39%"
          : "Hero equity (solid): 30.50% Break-even (dashed): 24.39%",
      );
      expect(curve).toEqual(original);
    },
  );
});
