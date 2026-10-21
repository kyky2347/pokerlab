import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Trainer from "@/app/trainer/page";
import { postJson } from "@/lib/api";
import { useLabStore } from "@/lib/store";

vi.mock("@/lib/api", () => ({ postJson: vi.fn() }));

// Synthetic transport fixtures, never shipped as product results.
const scenario = {
  id: "question-1",
  hero: ["As", "Ks"],
  villain: ["Qh", "Qd"],
  board: ["Js", "8s", "2c"],
  category: "flush_draw",
  difficulty: "core",
  seed: 20250902,
  adaptive_weight: 1,
  engine: "Python reference",
};
const feedback = {
  answer: 0.625,
  true_equity: 0.6,
  absolute_error: 0.025,
  score: 99,
  category: "flush_draw",
  scoring: "100 × max(0, 1 - (absolute_error / 0.25)²)",
  weaknesses: [{ category: "flush_draw", average_error: 0.025, answers: 1 }],
};
const clients: QueryClient[] = [];
function mount() {
  // Page-level mutation settings must override a provider that normally retries.
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 3, retryDelay: 0 } },
  });
  clients.push(client);
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Trainer />
      </QueryClientProvider>
    </StrictMode>,
  );
  return userEvent.setup();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function metric(label: string) {
  return screen.getByText(label, { exact: true }).parentElement;
}
async function ready() {
  await screen.findByText(/engine: Python reference/);
}
function estimate(value = "62.5") {
  fireEvent.change(screen.getByRole("slider", { name: "Equity estimate" }), {
    target: { value },
  });
}
async function score(user: ReturnType<typeof userEvent.setup>) {
  await ready();
  estimate();
  await user.click(screen.getByRole("button", { name: "Lock answer" }));
  await screen.findByText("Actual equity");
}
beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no layout; Base UI hides edge-aligned thumbs until measurable.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 20),
  );
  useLabStore.setState({ locale: "en" });
  vi.mocked(postJson).mockImplementation(async (path, body) =>
    path === "/trainer/question"
      ? { ...scenario, seed: (body as { seed: number }).seed }
      : feedback,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  clients.splice(0).forEach((client) => client.clear());
});

describe("trainer recovery", () => {
  it("requests once under Strict Mode and never invents an empty-session error average", async () => {
    mount();
    await ready();
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(metric("Questions")).toHaveTextContent("0");
    expect(metric("Average error")).toHaveTextContent("—");
    expect(metric("Average score")).toHaveTextContent("—");
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("replaces a failed initial spinner with a same-seed manual retry", async () => {
    vi.mocked(postJson).mockRejectedValueOnce(new Error("service unavailable"));
    const user = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not generate a scenario",
    );
    expect(screen.queryByText("Generating question")).not.toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lock answer" })).toBeDisabled();
    expect(postJson).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Retry scenario" }));
    await ready();
    expect(vi.mocked(postJson).mock.calls).toEqual([
      ["/trainer/question", { seed: scenario.seed }],
      ["/trainer/question", { seed: scenario.seed }],
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeEnabled();
  });

  it("attempts the local API even when the browser reports offline, then exposes recovery", async () => {
    onlineManager.setOnline(false);
    vi.mocked(postJson).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not generate a scenario",
    );
    expect(
      screen.getByRole("button", { name: "Retry scenario" }),
    ).toBeEnabled();
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it("locks the submitted estimate and allows only one rapid answer request", async () => {
    const pending = deferred<typeof feedback>();
    mount();
    await ready();
    estimate();
    vi.mocked(postJson).mockReturnValueOnce(pending.promise);
    const button = screen.getByRole("button", { name: "Lock answer" });
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    await waitFor(() => expect(screen.getByRole("slider")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Checking" })).toBeDisabled();
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson).toHaveBeenLastCalledWith("/trainer/answer", {
      question_id: scenario.id,
      answer: 0.625,
    });
    await act(async () => pending.resolve(feedback));
    await screen.findByText("Actual equity");
    expect(metric("Questions")).toHaveTextContent("1");
    expect(
      screen.getByRole("progressbar", { name: "Round score" }),
    ).toHaveAttribute("aria-valuenow", "99");
  });

  it("preserves a failed answer for manual retry and counts only confirmed results", async () => {
    const user = mount();
    await ready();
    estimate();
    vi.mocked(postJson).mockRejectedValueOnce(new Error("response lost"));
    await user.click(screen.getByRole("button", { name: "Lock answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A lost response may mean the score was saved",
    );
    expect(screen.getByRole("slider")).toHaveValue("62.5");
    expect(metric("Questions")).toHaveTextContent("0");
    expect(postJson).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Retry answer" }));
    await screen.findByText("Actual equity");
    expect(vi.mocked(postJson).mock.calls[2]).toEqual(
      vi.mocked(postJson).mock.calls[1],
    );
    expect(metric("Questions")).toHaveTextContent("1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not queue an offline answer for a surprise replay on reconnect", async () => {
    const user = mount();
    await ready();
    onlineManager.setOnline(false);
    vi.mocked(postJson).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Lock answer" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Retry answer" })).toBeEnabled();
    await act(async () => {
      onlineManager.setOnline(true);
    });
    expect(postJson).toHaveBeenCalledTimes(2);
  });

  it("keeps feedback and weaknesses through next-question failure, and retries without skipping the seed", async () => {
    const user = mount();
    await score(user);
    const pending = deferred<typeof scenario>();
    vi.mocked(postJson).mockReturnValueOnce(pending.promise);
    const next = screen.getByRole("button", { name: "Next scenario" });
    act(() => {
      next.click();
      next.click();
    });
    await screen.findByText(
      "Generating the next scenario; keeping the previous feedback.",
    );
    expect(screen.getByText("Actual equity")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveValue("62.5");
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(postJson).toHaveBeenCalledTimes(3);
    await act(async () => pending.reject(new Error("temporary failure")));
    await screen.findByRole("alert");
    expect(screen.getByText("1 answer")).toBeInTheDocument();
    expect(screen.getByText("Actual equity")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next scenario" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry scenario" }));
    await waitFor(() =>
      expect(screen.queryByText("Actual equity")).not.toBeInTheDocument(),
    );
    expect(vi.mocked(postJson).mock.calls[2]).toEqual([
      "/trainer/question",
      { seed: scenario.seed + 7919 },
    ]);
    expect(vi.mocked(postJson).mock.calls[3]).toEqual(
      vi.mocked(postJson).mock.calls[2],
    );
    expect(screen.getByRole("slider")).toHaveValue("50");
    expect(screen.getByRole("slider")).toBeEnabled();
    expect(screen.getByText("1 answer")).toBeInTheDocument();
    expect(metric("Questions")).toHaveTextContent("1");
  });

  it("lets an expired or already-answered round start a new scenario without inventing feedback", async () => {
    const user = mount();
    await ready();
    vi.mocked(postJson).mockRejectedValueOnce(
      new Error(
        "Question expired or was already answered / 题目已过期或已提交",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Lock answer" }));
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Start a new scenario" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Actual equity")).not.toBeInTheDocument();
    expect(metric("Questions")).toHaveTextContent("0");
    expect(postJson).toHaveBeenLastCalledWith("/trainer/question", {
      seed: scenario.seed + 7919,
    });
    expect(screen.getByRole("button", { name: "Lock answer" })).toBeEnabled();
  });

  it("accumulates different confirmed scores across five rounds", async () => {
    const user = mount();
    for (let index = 0; index < 5; index++) {
      await ready();
      vi.mocked(postJson).mockResolvedValueOnce({
        ...feedback,
        score: [99, 96, 91, 84, 75][index],
        absolute_error: 0.025 * (index + 1),
      });
      await score(user);
      if (index < 4) {
        await user.click(screen.getByRole("button", { name: "Next scenario" }));
        await waitFor(() =>
          expect(screen.queryByText("Actual equity")).not.toBeInTheDocument(),
        );
      }
    }
    expect(metric("Questions")).toHaveTextContent("5");
    expect(metric("Average error")).toHaveTextContent("7.50 pp");
    expect(metric("Average score")).toHaveTextContent("89.0");
    expect(screen.getByText("Five-round session complete")).toBeInTheDocument();
  });

  it("switches all round metrics, controls and card labels to Chinese without making new requests", async () => {
    const user = mount();
    await score(user);
    act(() => useLabStore.setState({ locale: "zh" }));
    expect(screen.getByRole("slider", { name: "胜率估计" })).toBeDisabled();
    for (const text of [
      "英雄",
      "对手",
      "基础",
      "实际胜率",
      "绝对误差",
      "已答题数",
      "平均误差",
      "平均得分",
      "1 次作答",
    ]) {
      expect(screen.getByText(text, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "下一题" })).toBeEnabled();
    expect(
      screen.getByRole("progressbar", { name: "本轮得分" }),
    ).toBeInTheDocument();
    expect(postJson).toHaveBeenCalledTimes(2);
  });

  it("localizes failure and recovery controls into Chinese", async () => {
    useLabStore.setState({ locale: "zh" });
    vi.mocked(postJson).mockRejectedValueOnce(new Error("API offline"));
    const user = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("未能生成题目");
    await user.click(screen.getByRole("button", { name: "重试出题" }));
    await screen.findByText(/引擎: Python reference/);
    vi.mocked(postJson).mockRejectedValueOnce(new Error("API offline"));
    await user.click(screen.getByRole("button", { name: "锁定答案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法确认本轮结果",
    );
    expect(screen.getByRole("button", { name: "重试提交答案" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "开始新题" })).toBeEnabled();
  });

  it.each([
    ["pair_vs_overcards", "口袋对子对抗高张"],
    ["flush_draw", "同花听牌"],
    ["straight_draw", "顺子听牌"],
    ["combo_draw", "组合听牌"],
    ["overpair", "超对"],
    ["top_pair", "顶对"],
    ["two_pair", "两对"],
    ["set", "暗三条"],
    ["turn_decision", "转牌决策"],
  ])("translates the %s scenario category", async (category, label) => {
    useLabStore.setState({ locale: "zh" });
    vi.mocked(postJson).mockResolvedValue({
      ...scenario,
      category,
      difficulty: "advanced",
    });
    mount();
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText("进阶")).toBeInTheDocument();
  });
});
