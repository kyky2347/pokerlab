import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { cloneElement, type ReactElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EVLab from "@/app/ev/page";
import { useLabStore } from "@/lib/store";

// Supply jsdom dimensions, keeping the actual chart, sliders, query cache and
// HTTP transport. All result values below are test-only server fixtures.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        { width: 600, height: 380 },
      ),
  };
});

const initialInputs = {
  pot: 100,
  opponent_bet: 50,
  call_size: 50,
  hero_equity: 0.3,
  effective_stack: 200,
};
const initialResult = {
  final_pot_after_call: 200,
  required_equity: 0.25,
  pot_odds: 0.25,
  incremental_call_ev: 10,
  decision: "call",
  formula: "EV(call) = equity × final pot after call − call size",
  curve: [
    { equity: 0, ev: -50 },
    { equity: 1, ev: 150 },
  ],
};
type Pending = {
  path: string;
  body: typeof initialInputs;
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};
let requests: Pending[];
const clients: QueryClient[] = [];

async function mount(strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  clients.push(client);
  const content = (
    <QueryClientProvider client={client}>
      <EVLab />
    </QueryClientProvider>
  );
  const view = render(strict ? <StrictMode>{content}</StrictMode> : content);
  await advance(); // Base UI mounts its accessible input after initialization.
  return view;
}
async function advance(ms = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}
async function respond(index: number, result = initialResult) {
  await act(async () => {
    requests[index].resolve(Response.json(result));
  });
  await advance();
}
function change(name: string, value: number) {
  fireEvent.change(screen.getByRole("slider", { name }), {
    target: { value: String(value) },
  });
}
function ev(zh = false) {
  const card = screen
    .getByText(zh ? "跟注决策" : "Call decision")
    .closest('[data-slot="card"]') as HTMLElement;
  return within(card).queryByText(zh ? "跟注 EV" : "EV(call)", {
    selector: "p",
  })?.nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  onlineManager.setOnline(true);
  focusManager.setFocused(true);
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
  focusManager.setFocused(undefined);
  useLabStore.setState({ locale: "en" });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(["en", "zh"] as const)("EV request lifecycle (%s)", (locale) => {
  const zh = locale === "zh";
  const equityLabel = zh ? "英雄胜率" : "Hero equity";
  const potLabel = zh ? "当前底池" : "Pot before bet";
  beforeEach(() => useLabStore.setState({ locale }));

  it("loads immediately and renders server values without recalculating EV", async () => {
    await mount();
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/ev/calculate");
    expect(requests[0].body).toEqual(initialInputs);
    expect(screen.getByRole("status")).toHaveTextContent(
      zh ? "正在计算 EV" : "Calculating EV",
    );
    // Deliberately distinguish the response from any browser-side formula.
    await respond(0, { ...initialResult, incremental_call_ev: 12.34 });
    expect(ev(zh)).toBe("+$12.34");
    expect(screen.getByRole("figure")).toHaveTextContent("30.00%");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("coalesces a burst across inputs and hides outdated metrics and chart", async () => {
    await mount();
    await respond(0);
    change(potLabel, 105);
    await advance(60);
    change(equityLabel, 30.5);
    await advance(60);
    change(equityLabel, 31);
    await advance(100);
    expect(requests).toHaveLength(1);
    expect(ev(zh)).toBeUndefined();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      zh ? "等待编辑完成" : "Waiting for edits",
    );
    await advance(50);
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual({
      ...initialInputs,
      pot: 105,
      hero_equity: 0.31,
    });
    await respond(1, { ...initialResult, incremental_call_ev: 13.55 });
    expect(ev(zh)).toBe("+$13.55");
    expect(screen.getByRole("figure")).toHaveTextContent("31.00%");
  });

  it("aborts immediately and cannot display a late obsolete result", async () => {
    await mount();
    change(equityLabel, 31);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests).toHaveLength(1);
    await advance(150);
    await respond(1, { ...initialResult, incremental_call_ev: 12 });
    await respond(0); // Even a transport that ignores cancellation cannot win.
    expect(ev(zh)).toBe("+$12.00");
    expect(screen.getByRole("figure")).toHaveTextContent("31.00%");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a traceable failure and retries the current inputs only on request", async () => {
    await mount();
    change(potLabel, 105);
    await advance(150);
    await act(async () =>
      requests[1].resolve(
        Response.json(
          { error: { message: "Service unavailable / 服务不可用" } },
          { status: 503, headers: { "x-request-id": "ev-retry-1" } },
        ),
      ),
    );
    await advance(2000);
    expect(requests).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("ev-retry-1");
    expect(screen.getByRole("alert")).toHaveTextContent(
      zh ? "无法计算 EV" : "Could not calculate EV",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: zh ? "重试计算" : "Retry calculation",
      }),
    );
    await advance();
    expect(requests).toHaveLength(3);
    expect(requests[2].body).toEqual({ ...initialInputs, pot: 105 });
    expect(
      screen.queryByRole("button", {
        name: zh ? "重试计算" : "Retry calculation",
      }),
    ).not.toBeInTheDocument();
    await respond(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(ev(zh)).toBe("+$10.00");
  });

  it("recovers from a network error by editing without retrying old inputs", async () => {
    await mount();
    await act(async () => requests[0].reject(new TypeError("Failed to fetch")));
    await advance();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    change(equityLabel, 31);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await advance(150);
    expect(requests).toHaveLength(2);
    expect(requests[1].body.hero_equity).toBe(0.31);
    await respond(1);
    expect(ev(zh)).toBe("+$10.00");
  });

  it("resumes only the latest edited inputs after reconnecting", async () => {
    onlineManager.setOnline(false);
    await mount();
    await advance();
    expect(screen.getByRole("status")).toHaveTextContent(
      zh ? "当前离线" : "You are offline",
    );
    change(potLabel, 105);
    await advance(150);
    change(equityLabel, 31);
    await advance(150);
    expect(requests).toHaveLength(0);
    act(() => onlineManager.setOnline(true));
    await advance();
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({
      ...initialInputs,
      pot: 105,
      hero_equity: 0.31,
    });
    await respond(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

it("isolates all input cache keys and reuses only a matching fresh result", async () => {
  await mount();
  await respond(0);
  change("Hero equity", 31);
  await advance(150);
  await respond(1, { ...initialResult, incremental_call_ev: 12 });
  change("Hero equity", 30);
  expect(ev()).toBeUndefined();
  await advance(150);
  expect(requests).toHaveLength(2);
  expect(ev()).toBe("+$10.00");
  expect(screen.getByRole("figure")).toHaveTextContent("30.00%");
  change("Effective stack", 210);
  await advance(150);
  expect(requests).toHaveLength(3);
  expect(requests[2].body.effective_stack).toBe(210);
  expect(ev()).toBeUndefined();
});

it("sends one valid, clamped tuple after coupled bet, call and stack edits", async () => {
  await mount();
  change("Opponent bet", 150);
  change("Call size", 125);
  change("Effective stack", 100);
  await advance(150);
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toEqual({
    ...initialInputs,
    opponent_bet: 100,
    call_size: 100,
    effective_stack: 100,
  });
  change("Opponent bet", 0);
  change("Hero equity", 0);
  await advance(150);
  expect(requests[2].body).toEqual({
    ...initialInputs,
    opponent_bet: 0,
    call_size: 0,
    hero_equity: 0,
    effective_stack: 100,
  });
  await respond(2, {
    ...initialResult,
    required_equity: 0,
    incremental_call_ev: 0,
    decision: "break_even",
  });
  expect(ev()).toBe("+$0.00");
  expect(
    screen.getByText("Break-even", { selector: '[data-slot="badge"]' }),
  ).toBeInTheDocument();
  change("Hero equity", 100);
  await advance(150);
  expect(requests[3].body.hero_equity).toBe(1);
});

it("does not refetch stale results merely when the window regains focus", async () => {
  await mount();
  await respond(0);
  await advance(31_000);
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await advance();
  expect(requests).toHaveLength(1);
});

it("aborts on unmount and clears any scheduled edit", async () => {
  const view = await mount();
  change("Hero equity", 31);
  expect(requests[0].signal.aborted).toBe(true);
  await advance(150);
  expect(requests[1].signal.aborted).toBe(false);
  view.unmount();
  expect(requests[1].signal.aborted).toBe(true);
  await advance(500);
  expect(requests).toHaveLength(2);
});

it("clears a debounce timer before it starts a request after unmount", async () => {
  const view = await mount();
  change("Hero equity", 31);
  view.unmount();
  await advance(500);
  expect(requests).toHaveLength(1);
});

it("handles Strict Mode cancellation and fetches the edited tuple once", async () => {
  await mount(true);
  expect(requests).toHaveLength(2);
  expect(requests[0].signal.aborted).toBe(true);
  change("Hero equity", 31);
  expect(requests[1].signal.aborted).toBe(true);
  await advance(150);
  expect(requests).toHaveLength(3);
  await respond(2);
  expect(ev()).toBe("+$10.00");
});
