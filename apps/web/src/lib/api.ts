export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 180_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    )
      throw error;
    return {};
  })) as {
    error?: { message?: string };
    detail?: string;
  };
  if (!response.ok)
    throw new ApiError(
      payload.error?.message ??
        payload.detail ??
        "The calculation could not be completed.",
      response.status,
    );
  return payload as T;
}

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await parseResponse<T>(
      await fetch(`${API_URL}${path}`, {
        cache: "no-store",
        signal: requestSignal(signal),
      }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new ApiError("The API request timed out after three minutes.", 408);
    throw error;
  }
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
  try {
    const response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      signal: requestSignal(signal),
    });
    if (!response.ok) await parseResponse<never>(response);
    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new ApiError("The API request timed out after three minutes.", 408);
    throw error;
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    return await parseResponse<T>(
      await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new ApiError("The API request timed out after three minutes.", 408);
    throw error;
  }
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
