import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Experiments from "@/app/experiments/page";
import { downloadJsonText, getJson, getText } from "@/lib/api";
import type { ExperimentPage, ExperimentSummary } from "@/lib/experiments";
import { useLabStore } from "@/lib/store";

vi.mock("@/lib/api", () => ({
  getJson: vi.fn(),
  getText: vi.fn(),
  downloadJsonText: vi.fn(),
}));

const first: ExperimentSummary = {
  id: "first",
  experiment_type: "exact_equity",
  seed: "9223372036854775807",
  engine: "Rust accelerated",
  runtime_ms: 2,
  timestamp: "2026-01-02T00:00:00+00:00",
};
const second: ExperimentSummary = {
  ...first,
  id: "second",
  experiment_type: "range_equity",
  seed: null,
};
const raw = '{\n  "id": "first",\n  "seed": 9223372036854775807\n}';
const page = (
  experiments = [first],
  next: string | null = null,
): ExperimentPage => ({
  experiments,
  next_cursor: next,
  database: "postgresql",
});
const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <Experiments />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  useLabStore.setState({ locale: "en" });
  vi.mocked(getJson).mockResolvedValue(page());
  vi.mocked(getText).mockResolvedValue(raw);
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  clients.splice(0).forEach((client) => client.clear());
});

describe("experiment ledger", () => {
  it("shows an actionable error offline instead of leaving the query silently paused", async () => {
    onlineManager.setOnline(false);
    vi.mocked(getJson).mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    expect(
      await screen.findByText("Could not load experiment history"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(
      screen.queryByText("Loading experiment summaries…"),
    ).not.toBeInTheDocument();
  });
  it("loads summaries and one raw detail, preserving integer seeds in copy/download", async () => {
    const user = mount();
    expect(await screen.findByText("PostgreSQL")).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Complete experiment JSON"),
    ).toHaveTextContent("9223372036854775807");
    expect(getJson).toHaveBeenCalledWith(
      "/experiments/page?limit=20",
      expect.any(AbortSignal),
    );
    expect(getText).toHaveBeenCalledTimes(1);
    expect(getText).toHaveBeenCalledWith(
      "/experiments/first/export",
      expect.any(AbortSignal),
    );
    const clipboard = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(
      screen.getByRole("button", { name: "Copy experiment JSON" }),
    );
    expect(clipboard).toHaveBeenCalledWith(raw);
    expect(
      await screen.findByText("Complete JSON copied."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    expect(downloadJsonText).toHaveBeenCalledWith("pokerlab-first.json", raw);
    expect(screen.queryByText("LOCAL SQLITE")).not.toBeInTheDocument();
  });

  it("paginates, resets selection, and refreshes the latest page even when cached", async () => {
    vi.mocked(getJson)
      .mockResolvedValueOnce(page([first], "next+token"))
      .mockResolvedValueOnce(page([second]))
      .mockResolvedValue(page([first]));
    const user = mount();
    await screen.findByLabelText("Complete experiment JSON");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("Page 2 · 1 record on this page"),
    ).toBeInTheDocument();
    expect(getJson).toHaveBeenCalledWith(
      "/experiments/page?limit=20&cursor=next%2Btoken",
      expect.any(AbortSignal),
    );
    expect(getText).toHaveBeenCalledWith(
      "/experiments/second/export",
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Refresh latest records" }),
    );
    expect(
      await screen.findByText("Page 1 · 1 record on this page"),
    ).toBeInTheDocument();
    expect(getJson).toHaveBeenCalledTimes(3);
  });

  it("keeps failed history distinct from empty history and provides retry", async () => {
    vi.mocked(getJson)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(page([]));
    const user = mount();
    expect(
      await screen.findByText("Could not load experiment history"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No experiments on this page"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Storage unconfirmed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No experiments on this page"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Equity Lab" }),
    ).toHaveAttribute("href", "/equity");
    expect(getText).not.toHaveBeenCalled();
  });

  it("retries missing detail without exporting a different or incomplete record", async () => {
    vi.mocked(getText)
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValue(raw);
    const user = mount();
    expect(
      await screen.findByText("Could not load this experiment"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download JSON" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByLabelText("Complete experiment JSON"),
    ).toHaveTextContent("9223372036854775807");
  });

  it("handles denied clipboard permission and keeps download available", async () => {
    const user = mount();
    await screen.findByLabelText("Complete experiment JSON");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy experiment JSON" }),
    );
    expect(
      await screen.findByText("Clipboard unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeEnabled();
    expect(screen.queryByText("Complete JSON copied.")).not.toBeInTheDocument();
  });

  it("cancels abandoned detail and never renders a late response over the new selection", async () => {
    vi.mocked(getJson).mockResolvedValue(page([first, second]));
    let resolveFirst!: (value: string) => void;
    vi.mocked(getText)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue('{"id":"second"}');
    const user = mount();
    await screen.findByText("Loading the complete record…");
    const signal = vi.mocked(getText).mock.calls[0][1];
    await user.click(
      screen.getByRole("button", { name: /Range equity Rust accelerated/ }),
    );
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(
      await screen.findByLabelText("Complete experiment JSON"),
    ).toHaveTextContent('"second"');
    await act(async () => resolveFirst(raw));
    expect(
      screen.getByLabelText("Complete experiment JSON"),
    ).not.toHaveTextContent("9223372036854775807");
  });

  it("localizes record names, pagination, exports, and feedback into Chinese", async () => {
    useLabStore.setState({ locale: "zh" });
    const user = mount();
    expect(await screen.findByText("第 1 页 · 本页 1 条")).toBeInTheDocument();
    await screen.findByLabelText("完整实验 JSON");
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    expect(screen.getAllByText("精确胜率")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "复制实验 JSON" }));
    expect(await screen.findByText("完整 JSON 已复制。")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "下载 JSON" }),
    ).toBeInTheDocument();
  });
});
