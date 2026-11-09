import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RangeLab from "@/app/range/page";
import { useLabStore } from "@/lib/store";
import type { RangeResult } from "@/lib/types";

// Transport fixtures only: production statistics always come from the API.
const statistics = {
  hand_classes: 5,
  physical_combos: 34,
  range_percent: 2.56,
  blocker_adjusted_combos: 27,
  weighted_combos: 22.5,
};
type Pending = {
  path: string;
  body: { range: Record<string, number>; blocked: string[] };
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};
let requests: Pending[];
const clients: QueryClient[] = [];

function mount(strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  clients.push(client);
  const content = (
    <QueryClientProvider client={client}>
      <RangeLab />
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

async function advance(ms = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

async function respond(index: number, weighted = 22.5) {
  await act(async () => {
    requests[index].resolve(
      Response.json({ ...statistics, weighted_combos: weighted }),
    );
  });
  await advance();
}

function weight(zh: boolean) {
  return screen.queryByText(zh ? "加权组合" : "Weighted combos", {
    selector: "p",
  })?.nextElementSibling?.textContent;
}

function clickCell(hand: string, zh = false) {
  fireEvent.click(
    screen.getByRole("button", {
      name: zh ? `${hand} 权重 0%` : `${hand} 0 percent`,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  onlineManager.setOnline(true);
  useLabStore.setState({ locale: "en" });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 20),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          requests.push({
            path: new URL(url).pathname,
            body: JSON.parse(init.body as string),
            signal: init.signal as AbortSignal,
            resolve,
            reject,
          });
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
  useLabStore.setState({ locale: "en" });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(["en", "zh"] as const)(
  "range statistics recovery (%s)",
  (locale) => {
    const zh = locale === "zh";
    beforeEach(() => useLabStore.setState({ locale }));

    it("loads the backend values immediately without creating an equity experiment", async () => {
      mount();
      expect(requests).toHaveLength(1);
      expect(requests[0].path).toBe("/range/statistics");
      expect(requests[0].body.blocked).toEqual(["Ah", "7d", "5s", "3c", "2h"]);
      expect(screen.getByRole("status")).toHaveTextContent(
        zh ? "正在计算组合" : "Calculating combinations",
      );
      await respond(0, 19.25);
      expect(weight(zh)).toBe("19.25");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("exposes a traceable failure and retries the same range once on request", async () => {
      mount();
      await act(async () =>
        requests[0].resolve(
          Response.json(
            { error: { message: "Service unavailable / 服务不可用" } },
            { status: 503, headers: { "x-request-id": "range-retry-1" } },
          ),
        ),
      );
      await advance(2000);
      expect(requests).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent("range-retry-1");
      expect(screen.getByRole("alert")).toHaveTextContent(
        zh ? "无法获取范围统计" : "Could not load range statistics",
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: zh ? "重试统计" : "Retry statistics",
        }),
      );
      await advance();
      expect(requests).toHaveLength(2);
      expect(requests[1].body).toEqual(requests[0].body);
      expect(
        screen.queryByRole("button", {
          name: zh ? "重试统计" : "Retry statistics",
        }),
      ).not.toBeInTheDocument();
      await respond(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(weight(zh)).toBe("22.50");
    });

    it("recovers from network failure by editing instead of retrying obsolete input", async () => {
      mount();
      await act(async () =>
        requests[0].reject(new TypeError("Failed to fetch")),
      );
      await advance();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      clickCell("A6s", zh);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        zh ? "等待编辑完成" : "Waiting for edits",
      );
      await advance(150);
      expect(requests).toHaveLength(2);
      expect(requests[1].body.range.A6s).toBe(0.25);
      await respond(1, 23.25);
      expect(weight(zh)).toBe("23.25");
    });

    it("coalesces rapid edits and hides old statistics while waiting", async () => {
      mount();
      await respond(0);
      clickCell("A6s", zh);
      await advance(60);
      clickCell("A7s", zh);
      await advance(60);
      clickCell("A8s", zh);
      await advance(100);
      expect(weight(zh)).toBeUndefined();
      expect(requests).toHaveLength(1);
      await advance(50);
      expect(requests).toHaveLength(2);
      expect(requests[1].body.range).toMatchObject({
        A6s: 0.25,
        A7s: 0.25,
        A8s: 0.25,
      });
      await respond(1, 24.75);
      expect(weight(zh)).toBe("24.75");
    });

    it("aborts old reads immediately and ignores their late responses", async () => {
      mount();
      clickCell("A6s", zh);
      expect(requests[0].signal.aborted).toBe(true);
      expect(requests).toHaveLength(1);
      await advance(150);
      await respond(1, 23.25);
      await respond(0, 90.5); // Simulate a transport that finishes despite abort.
      expect(weight(zh)).toBe("23.25");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows an offline state and resumes the current request on reconnection", async () => {
      onlineManager.setOnline(false);
      mount();
      await advance();
      expect(requests).toHaveLength(0);
      expect(screen.getByRole("status")).toHaveTextContent(
        zh ? "当前离线" : "You are offline",
      );
      act(() => onlineManager.setOnline(true));
      await advance();
      expect(requests).toHaveLength(1);
      await respond(0);
      expect(weight(zh)).toBe("22.50");
    });
  },
);

it("keeps hero/villain caches independent and uses only current blockers", async () => {
  mount();
  await respond(0);
  fireEvent.click(screen.getByRole("tab", { name: "Villain range" }));
  await advance(150);
  expect(requests[1].body.range).toEqual({
    JJ: 1,
    TT: 1,
    AQs: 1,
    AQo: 1,
    KQs: 0.5,
  });
  await respond(1, 30.5);
  expect(weight(false)).toBe("30.50");
  fireEvent.click(screen.getByRole("tab", { name: "Hero range" }));
  await advance(150);
  expect(requests).toHaveLength(2);
  expect(weight(false)).toBe("22.50");
  fireEvent.click(screen.getByRole("button", { name: "A of hearts" }));
  await advance(150);
  expect(requests[2].body.blocked).toEqual(["7d", "5s", "3c", "2h"]);
  expect(requests[2].body.range).toEqual(requests[0].body.range);
  await respond(2, 25.5);
  expect(weight(false)).toBe("25.50");
});

it("clears the debounce timer on unmount", async () => {
  const view = mount();
  clickCell("A6s");
  expect(requests[0].signal.aborted).toBe(true);
  view.unmount();
  await advance(500);
  expect(requests).toHaveLength(1);
});

it("aborts an active read when the page unmounts", () => {
  const view = mount();
  expect(requests[0].signal.aborted).toBe(false);
  view.unmount();
  expect(requests[0].signal.aborted).toBe(true);
});

it("cancels the hero request on a tab switch and ignores its late response", async () => {
  mount();
  fireEvent.click(screen.getByRole("tab", { name: "Villain range" }));
  expect(requests[0].signal.aborted).toBe(true);
  await advance(150);
  await respond(1, 30.5);
  await respond(0, 22.5);
  expect(weight(false)).toBe("30.50");
});

it("shows the backend's zero statistics after clearing the range", async () => {
  mount();
  await respond(0);
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  await advance(150);
  expect(requests[1].body.range).toEqual({});
  await act(async () =>
    requests[1].resolve(
      Response.json({
        hand_classes: 0,
        physical_combos: 0,
        range_percent: 0,
        blocker_adjusted_combos: 0,
        weighted_combos: 0,
      }),
    ),
  );
  await advance();
  expect(weight(false)).toBe("0.00");
  expect(
    screen.getByRole("button", { name: "Calculate range vs range" }),
  ).toBeDisabled();
});

it("handles Strict Mode cancellation and fetches the edited range once", async () => {
  mount(true);
  expect(requests).toHaveLength(2);
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].signal.aborted).toBe(false);
  clickCell("A6s");
  expect(requests[1].signal.aborted).toBe(true);
  await advance(150);
  expect(requests).toHaveLength(3);
  await respond(2);
  expect(weight(false)).toBe("22.50");
});

// Deliberate transport fixture; the UI must render these server bounds verbatim.
const sampledResult: RangeResult = {
  hero_equity: 0.54,
  villain_equity: 0.46,
  win: 0.44,
  tie: 0.2,
  lose: 0.36,
  valid_combo_pairs: 1070190,
  weighted_combo_pair_mass: 1070190,
  evaluated_states: 20000,
  samples: 20000,
  method: "monte_carlo_weighted_pairs",
  seed: 20250902,
  engine: "Python reference",
  runtime_ms: 123,
  hero_statistics: statistics,
  villain_statistics: statistics,
  ci_low: 0.5304,
  ci_high: 0.5496,
  confidence_level: 0.95,
  confidence_method: "hoeffding_v1",
  confidence_scope: "pointwise_fixed_n",
};

describe.each(["en", "zh"] as const)(
  "range result interpretation (%s)",
  (locale) => {
    const zh = locale === "zh";
    beforeEach(() => useLabStore.setState({ locale }));

    async function calculate(result: RangeResult) {
      mount();
      await respond(0);
      fireEvent.click(
        screen.getByRole("button", {
          name: zh ? "计算范围对范围" : "Calculate range vs range",
        }),
      );
      await advance();
      expect(requests[1].path).toBe("/range/equity");
      expect(requests[1].body).toMatchObject({
        seed: 20250902,
        samples: 20000,
      });
      await act(async () => requests[1].resolve(Response.json(result)));
      await advance();
    }

    it("shows backend bounds, sampling method, engine, seed and range-assumption limits", async () => {
      await calculate(sampledResult);
      expect(screen.getByText("53.04% – 54.96%")).toBeInTheDocument();
      expect(
        screen.getByText(zh ? /蒙特卡洛估计/ : /Monte Carlo estimate/),
      ).toHaveTextContent(
        `Python reference · ${zh ? "种子" : "Seed"} 20250902`,
      );
      expect(
        screen.getByText(zh ? "样本数" : "Samples").nextElementSibling,
      ).toHaveTextContent("20,000");
      expect(
        screen.getByText(
          zh
            ? /不涵盖对手范围假设的偏差/
            : /does not cover uncertainty in your opponent-range assumptions/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          zh ? /不能用作提前停止的保证/ : /early-stopping guarantee/,
        ),
      ).toBeInTheDocument();
      clickCell("A6s", zh);
      expect(
        screen.queryByRole("note", {
          name: zh ? "蒙特卡洛不确定性" : "Monte Carlo uncertainty",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("53.04% – 54.96%")).not.toBeInTheDocument();
    });

    it("keeps exact enumeration separate even if a response contains sampling metadata", async () => {
      await calculate({
        ...sampledResult,
        method: "exact_weighted_enumeration",
        evaluated_states: 96,
      });
      expect(
        screen.getByText(zh ? /精确加权枚举/ : /Exact weighted enumeration/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          zh
            ? /没有蒙特卡洛抽样误差/
            : /there is no Monte Carlo sampling error/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("note", {
          name: zh ? "蒙特卡洛不确定性" : "Monte Carlo uncertainty",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(zh ? "样本数" : "Samples"),
      ).not.toBeInTheDocument();
    });

    it("does not manufacture a confidence interval for an older API", async () => {
      await calculate({
        ...sampledResult,
        confidence_method: undefined,
        ci_low: undefined,
        ci_high: undefined,
      });
      expect(
        screen.getByText(zh ? "区间方法未确认" : "Interval method unconfirmed"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(zh ? "未提供有效区间" : "No valid interval reported"),
      ).toBeInTheDocument();
      expect(screen.queryByText("53.04% – 54.96%")).not.toBeInTheDocument();
    });

    it("does not call an unknown method exact", async () => {
      await calculate({ ...sampledResult, method: "future_method" });
      expect(screen.getByText(/future_method/)).toBeInTheDocument();
      expect(
        screen.queryByText(
          zh
            ? /没有蒙特卡洛抽样误差/
            : /there is no Monte Carlo sampling error/,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("note", {
          name: zh ? "蒙特卡洛不确定性" : "Monte Carlo uncertainty",
        }),
      ).not.toBeInTheDocument();
    });
  },
);
