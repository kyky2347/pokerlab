export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  return parseResponse<T>(
    await fetch(`${API_URL}${path}`, { cache: "no-store" }),
  );
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return parseResponse<T>(
    await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyJson(value: unknown) {
  await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
}
