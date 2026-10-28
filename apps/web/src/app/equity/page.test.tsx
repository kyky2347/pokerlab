import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import EquityLab from "@/app/equity/page";
import { postJson } from "@/lib/api";
import { useLabStore } from "@/lib/store";

vi.mock("@/lib/api", () => ({ postJson: vi.fn() }));

// Transport fixtures for UI behavior only; never shipped as calculated results.
const equity = {
  equity: 0.6,
  win: 0.6,
  tie: 0,
  lose: 0.4,
  states: 990,
  samples: 10000,
  runtime_ms: 1,
  engine: "Python reference",
  method: "exact",
};
const turns = {
  turns: [{ card: "3d", equity: 0.5 }],
  runtime_ms: 1,
  engine: "Python reference",
};
const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 0 } },
  });
  clients.push(client);
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <EquityLab />
      </QueryClientProvider>
    </StrictMode>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  useLabStore.setState({ locale: "en" });
  vi.mocked(postJson).mockImplementation(async (path, body) =>
    path === "/equity/turn-map"
      ? turns
      : { ...equity, seed: (body as { seed?: number }).seed },
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe.each(["en", "zh"] as const)("equity seed precision (%s)", (locale) => {
  const zh = locale === "zh";
  const label = zh ? "种子" : "Seed";
  const calculate = zh ? "计算胜率" : "Calculate equity";
  const field = () =>
    screen.getByLabelText(label, { exact: true }) as HTMLInputElement;

  beforeEach(() => useLabStore.setState({ locale }));

  it.each([
    "",
    "-1",
    "1.5",
    "1e3",
    " 7 ",
    "not-a-seed",
    "9007199254740992",
    "9007199254740993",
    "9223372036854775807",
  ])(
    "keeps invalid text %j intact and sends no calculation requests",
    async (value) => {
      const user = mount();
      fireEvent.change(field(), { target: { value } });
      expect(field().value).toBe(value);
      expect(field()).toHaveAttribute("aria-invalid", "true");
      expect(field()).toHaveAccessibleDescription(/9,007,199,254,740,991/);
      expect(screen.getByRole("alert")).toHaveTextContent(
        zh ? "整数" : "whole number",
      );
      const button = screen.getByRole("button", { name: calculate });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(postJson).not.toHaveBeenCalled();
      expect(screen.queryByText("Exact equity")).not.toBeInTheDocument();
    },
  );

  it.each(["0", "007", "20250902", "9007199254740991"])(
    "submits safe seed %s as an exact integer and preserves the original text",
    async (value) => {
      const user = mount();
      fireEvent.change(field(), { target: { value } });
      await user.click(screen.getByRole("button", { name: calculate }));
      await screen.findByText("Exact equity");
      expect(field().value).toBe(value);
      expect(postJson).toHaveBeenCalledTimes(3);
      expect(postJson).toHaveBeenCalledWith("/equity/monte-carlo", {
        hero: ["As", "Ks"],
        villain: ["Qh", "Qd"],
        board: ["Js", "8s", "2c"],
        samples: 10000,
        seed: Number(value),
      });
      expect(postJson).toHaveBeenCalledWith("/equity/exact", {
        hero: ["As", "Ks"],
        villain: ["Qh", "Qd"],
        board: ["Js", "8s", "2c"],
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("recovers from a cleared seed without silently substituting zero", async () => {
    const user = mount();
    await user.clear(field());
    expect(field().value).toBe("");
    expect(screen.getByRole("button", { name: calculate })).toBeDisabled();
    await user.type(field(), "7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(postJson).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: calculate }));
    await screen.findByText("Exact equity");
    expect(postJson).toHaveBeenCalledTimes(3);
  });

  it("hides completed results when the seed is edited and requires a new run", async () => {
    const user = mount();
    await user.click(screen.getByRole("button", { name: calculate }));
    await screen.findByText("Exact equity");
    fireEvent.change(field(), { target: { value: "9007199254740993" } });
    expect(screen.queryByText("Exact equity")).not.toBeInTheDocument();
    fireEvent.change(field(), { target: { value: "7" } });
    expect(screen.queryByText("Exact equity")).not.toBeInTheDocument();
    expect(postJson).toHaveBeenCalledTimes(3);
    await user.click(screen.getByRole("button", { name: calculate }));
    await screen.findByText("Exact equity");
    expect(postJson).toHaveBeenCalledTimes(6);
  });

  it("ignores responses from a previous valid run after editing the seed", async () => {
    const pending: Array<() => void> = [];
    vi.mocked(postJson).mockImplementation(
      (path) =>
        new Promise((resolve) => {
          pending.push(() =>
            resolve(path === "/equity/turn-map" ? turns : equity),
          );
        }),
    );
    const user = mount();
    await user.click(screen.getByRole("button", { name: calculate }));
    await waitFor(() => expect(pending).toHaveLength(3));
    fireEvent.change(field(), { target: { value: "9007199254740993" } });
    await act(async () => pending.forEach((resolve) => resolve()));
    expect(field().value).toBe("9007199254740993");
    expect(screen.queryByText("Exact equity")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: calculate })).toBeDisabled();
    expect(postJson).toHaveBeenCalledTimes(3);
  });

  it("keeps a corrected run when older responses arrive last", async () => {
    const oldResponses: Array<() => void> = [];
    let requests = 0;
    vi.mocked(postJson).mockImplementation((path, body) => {
      const result =
        path === "/equity/turn-map"
          ? turns
          : { ...equity, seed: (body as { seed?: number }).seed };
      if (++requests <= 3) {
        return new Promise((resolve) =>
          oldResponses.push(() => resolve(result)),
        );
      }
      return Promise.resolve(result);
    });
    const user = mount();
    await user.click(screen.getByRole("button", { name: calculate }));
    await waitFor(() => expect(oldResponses).toHaveLength(3));
    fireEvent.change(field(), { target: { value: "9007199254740993" } });
    fireEvent.change(field(), { target: { value: "7" } });
    await user.click(screen.getByRole("button", { name: calculate }));
    const engineAndSeed = `Python reference · ${label} 7`;
    await screen.findByText(engineAndSeed);
    await act(async () => oldResponses.forEach((resolve) => resolve()));
    expect(screen.getByText(engineAndSeed)).toBeInTheDocument();
    expect(field().value).toBe("7");
    expect(postJson).toHaveBeenCalledTimes(6);
    const calls = vi
      .mocked(postJson)
      .mock.calls.filter(([path]) => path === "/equity/monte-carlo");
    expect(calls.map(([, body]) => (body as { seed: number }).seed)).toEqual([
      20250902, 7,
    ]);
  });
});
