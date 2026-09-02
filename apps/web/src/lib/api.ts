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
  const payload = (await response.json().catch(() => ({}))) as {
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

export async function getJson<T>(path: string): Promise<T> {
  try {
    return parseResponse<T>(
      await fetch(`${API_URL}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new ApiError("The API request timed out after three minutes.", 408);
    throw error;
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    return parseResponse<T>(
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
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
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
