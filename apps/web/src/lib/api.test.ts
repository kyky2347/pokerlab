import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, downloadJsonText, getJson, getText, postJson } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lossless export transport", () => {
  it("reads the server text without parsing or rounding numbers", async () => {
    const original = '{"seed":9223372036854775807,"note":"复现"}';
    const parse = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => original,
        json: parse,
      }),
    );
    expect(await getText("/export")).toBe(original);
    expect(parse).not.toHaveBeenCalled();
  });

  it("propagates caller cancellation into the fetch signal", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "{}" });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await getText("/export", controller.signal);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("reports API errors instead of downloading error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "Experiment not found" } }),
      }),
    );
    await expect(getText("/missing")).rejects.toEqual(
      new ApiError("Experiment not found", 404),
    );
  });

  it.each(["text", "json", "post"])(
    "handles %s response-body timeouts",
    async (format) => {
      const timeout = new DOMException("timed out", "TimeoutError");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => {
            throw timeout;
          },
          json: async () => {
            throw timeout;
          },
        }),
      );
      const call =
        format === "text"
          ? getText("/slow")
          : format === "post"
            ? postJson("/slow", {})
            : getJson("/slow");
      await expect(call).rejects.toMatchObject({ status: 408 });
    },
  );

  it("downloads exact UTF-8 JSON text and releases the object URL", () => {
    vi.useFakeTimers();
    const blob = vi.fn();
    const revoke = vi.fn();
    vi.stubGlobal(
      "Blob",
      class {
        constructor(parts: unknown[], options: unknown) {
          blob(parts, options);
        }
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:experiment",
      revokeObjectURL: revoke,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const raw = '{"seed":9223372036854775807,"note":"中文"}';
    try {
      downloadJsonText("pokerlab-test.json", raw);
      expect(blob).toHaveBeenCalledWith([raw], { type: "application/json" });
      expect(click).toHaveBeenCalledOnce();
      expect(
        document.querySelector('a[download="pokerlab-test.json"]'),
      ).toBeNull();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith("blob:experiment");
    } finally {
      vi.useRealTimers();
    }
  });
});
