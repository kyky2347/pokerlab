export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 180_000;
type ApiErrorKind = "http" | "invalid_response" | "timeout";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly kind: ApiErrorKind = "http",
  ) {
    super(
      requestId ? `${message} (Request ID / 请求编号: ${requestId})` : message,
    );
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function namedError(error: unknown, name: string) {
  // Browser and test-runtime errors may come from different DOM realms.
  return isRecord(error) && error.name === name;
}

function safeRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const id = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id) ? id : undefined;
}

function publicMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function parseResponse<T>(
  response: Response,
  signal: AbortSignal,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (namedError(error, "AbortError") || namedError(error, "TimeoutError"))
      throw error;
    // Neither malformed JSON nor an interrupted body is a successful result.
    // Don't expose parser messages: they can contain the original response.
  }
  const body = isRecord(payload) ? payload : undefined;
  const error = isRecord(body?.error) ? body.error : undefined;
  const requestId =
    safeRequestId(response.headers.get("x-request-id")) ??
    safeRequestId(error?.request_id);
  if (!response.ok) {
    throw new ApiError(
      publicMessage(error?.message) ??
        publicMessage(body?.detail) ??
        "The API request could not be completed. Check the result before retrying. / API 请求未能完成，请先核对结果再重试。",
      response.status,
      requestId,
    );
  }
  // PokerLab's JSON endpoints return objects or lists. This is a transport
  // check, not runtime validation of every field in the caller's generic T.
  if (payload === null || typeof payload !== "object") {
    throw new ApiError(
      "The API returned an invalid response. Check the result before retrying. / API 返回的响应无效，请先核对结果再重试。",
      response.status,
      requestId,
      "invalid_response",
    );
  }
  return payload as T;
}

async function request<T>(
  path: string,
  init: RequestInit,
  readBody: (response: Response, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const activeSignal = requestSignal(signal);
  let response: Response | undefined;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: activeSignal,
    });
    return await readBody(response, activeSignal);
  } catch (error) {
    const reason = activeSignal.aborted ? activeSignal.reason : error;
    if (namedError(reason, "TimeoutError")) {
      throw new ApiError(
        "The API request timed out after three minutes. Check the result before retrying. / API 请求在三分钟后超时，请先核对结果再重试。",
        408,
        safeRequestId(response?.headers.get("x-request-id")),
        "timeout",
      );
    }
    throw reason;
  }
}

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return request(path, { cache: "no-store" }, parseResponse<T>, signal);
}

function requestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// Preserve the server's JSON bytes, including integers beyond Number.MAX_SAFE_INTEGER.
export async function getText(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  return request(
    path,
    { cache: "no-store" },
    async (response, activeSignal) => {
      if (!response.ok) await parseResponse<never>(response, activeSignal);
      return response.text();
    },
    signal,
  );
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    parseResponse<T>,
  );
}

export function downloadJson(filename: string, value: unknown) {
  downloadJsonText(filename, JSON.stringify(value, null, 2));
}

export function downloadJsonText(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyJson(value: unknown) {
  await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
}
