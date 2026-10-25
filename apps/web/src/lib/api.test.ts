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
        headers: new Headers(),
        text: async () => original,
        json: parse,
      }),
    );
    expect(await getText("/export")).toBe(original);
    expect(parse).not.toHaveBeenCalled();
  });

  it("propagates caller cancellation into the fetch signal", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: async () => "{}",
    });
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
        headers: new Headers(),
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
          headers: new Headers(),
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

describe("API response boundaries", () => {
  const jsonCalls = {
    get: () => getJson("/result"),
    post: () => postJson("/result", { seed: 42 }),
  };

  for (const [method, call] of Object.entries(jsonCalls)) {
    it.each(["", "<html>private proxy error</html>", '{"equity":'])(
      `${method} rejects malformed success bodies without exposing their contents: %s`,
      async (body) => {
        const fetch = vi.fn().mockResolvedValue(
          new Response(body, {
            headers: { "x-request-id": "broken-response-1" },
          }),
        );
        vi.stubGlobal("fetch", fetch);
        const error = await call().catch((value: unknown) => value);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
          status: 200,
          kind: "invalid_response",
          requestId: "broken-response-1",
        });
        expect((error as Error).message).toContain("响应");
        expect((error as Error).message).toContain("broken-response-1");
        expect((error as Error).message).not.toMatch(/private proxy|equity/);
        expect(fetch).toHaveBeenCalledOnce();
      },
    );

    it.each([null, "ok", 42, true])(
      `${method} rejects scalar success payloads: %j`,
      async (body) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
        await expect(call()).rejects.toMatchObject({
          status: 200,
          kind: "invalid_response",
        });
      },
    );

    it.each([
      { equity: 0.5, engine: "Python reference" },
      [],
      [{ id: "example" }],
    ])(`${method} preserves object and array payloads: %j`, async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      expect(await call()).toEqual(body);
    });
  }

  it.each([
    null,
    [],
    42,
    { error: null },
    { error: { message: { private: "details" } } },
    { detail: [{ msg: "private details", input: "private input" }] },
    { error: { message: " " }, detail: false },
  ])("preserves HTTP status for unexpected error shapes: %j", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status: 503 })),
    );
    const error = await getJson("/result").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, kind: "http" });
    expect((error as Error).message).toContain("请求");
    expect((error as Error).message).not.toContain("private");
  });

  it.each(["get", "post", "export"])(
    "keeps %s failures traceable when the body is HTML",
    async (method) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("<html>private gateway</html>", {
            status: 502,
            headers: { "x-request-id": "gateway-1" },
          }),
        ),
      );
      const call =
        method === "export"
          ? getText("/export")
          : method === "post"
            ? postJson("/result", {})
            : getJson("/result");
      const error = await call.catch((value: unknown) => value);
      expect(error).toMatchObject({
        status: 502,
        kind: "http",
        requestId: "gateway-1",
      });
      expect((error as Error).message).toContain("gateway-1");
      expect((error as Error).message).not.toContain("private gateway");
    },
  );

  it.each([
    [
      { error: { message: "Safe message", request_id: "body-1" } },
      undefined,
      "Safe message",
      "body-1",
    ],
    [{ detail: "Legacy detail" }, "header-1", "Legacy detail", "header-1"],
    [
      {
        error: { message: "Current message", request_id: "body-1" },
        detail: "Legacy detail",
      },
      "header-1",
      "Current message",
      "header-1",
    ],
    [
      { error: { message: [], request_id: "body-1" }, detail: "Legacy detail" },
      undefined,
      "Legacy detail",
      "body-1",
    ],
  ])(
    "uses safe error messages and IDs without losing legacy details",
    async (body, header, message, requestId) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(body, {
            status: 422,
            headers: header ? { "x-request-id": header } : undefined,
          }),
        ),
      );
      const error = await postJson("/result", {}).catch(
        (value: unknown) => value,
      );
      expect(error).toMatchObject({ status: 422, requestId });
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).toContain(requestId);
    },
  );

  it.each(["<private>", "x".repeat(129), "line\nbreak", "私密", 42])(
    "does not reflect unsafe body request IDs: %j",
    async (requestId) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { error: { message: "Safe", request_id: requestId } },
              { status: 500 },
            ),
          ),
      );
      const error = await getJson("/result").catch((value: unknown) => value);
      expect(error).toMatchObject({
        status: 500,
        requestId: undefined,
        message: "Safe",
      });
    },
  );

  it("falls back to a safe body ID if the proxy header is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "Safe", request_id: "body-1" } },
          {
            status: 500,
            headers: { "x-request-id": "private/path" },
          },
        ),
      ),
    );
    await expect(getJson("/result")).rejects.toMatchObject({
      requestId: "body-1",
    });
  });

  it("rejects an interrupted successful body instead of returning an empty result", async () => {
    const response = new Response("{}");
    vi.spyOn(response, "json").mockRejectedValue(
      new TypeError("private decode failure"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(getJson("/result")).rejects.toMatchObject({
      status: 200,
      kind: "invalid_response",
    });
  });

  it("preserves caller cancellation with a custom reason while reading JSON", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    const response = new Response("{}");
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort(reason);
      throw reason;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(getJson("/result", controller.signal)).rejects.toBe(reason);
  });

  it("keeps timeout correlation and bilingual recovery guidance", async () => {
    const response = new Response("{}", {
      headers: { "x-request-id": "slow-1" },
    });
    vi.spyOn(response, "json").mockRejectedValue(
      new DOMException("private timeout", "TimeoutError"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const error = await getJson("/result").catch((value: unknown) => value);
    expect(error).toMatchObject({
      status: 408,
      kind: "timeout",
      requestId: "slow-1",
    });
    expect((error as Error).message).toContain("超时");
    expect((error as Error).message).not.toContain("private timeout");
  });

  it("does not retry a failed POST or replace its network rejection", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetch = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetch);
    await expect(postJson("/trainer/answer", { answer: 0.5 })).rejects.toBe(
      failure,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});
