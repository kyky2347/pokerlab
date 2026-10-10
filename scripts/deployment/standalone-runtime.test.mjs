import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { assertVersionAtLeast } from "../assert-version.mjs";

// Run only inside the final Docker image, with --network none and no published
// ports. The server and tests share the container's isolated loopback interface.
const serverPath = fileURLToPath(
  new URL("../../apps/web/server.js", import.meta.url),
);
const runtimeRequire = createRequire(serverPath);
const origin = "http://127.0.0.1:31317";
let server;
let closed;
let startupError;
let logs = "";

async function request(path, options = {}) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(3_000),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=()",
  );
  assert.equal(response.headers.get("x-powered-by"), null);
}

before(async () => {
  await access(serverPath);
  server = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: "127.0.0.1",
      PORT: "31317",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  closed = new Promise((resolve) => {
    server.once("close", resolve);
    server.once("error", (error) => {
      startupError = error;
      resolve();
    });
  });
  const capture = (data) => {
    logs = (logs + data.toString()).slice(-16_384);
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (
      startupError ||
      server.exitCode !== null ||
      server.signalCode !== null
    ) {
      throw new Error(`Standalone server exited: ${startupError ?? logs}`);
    }
    try {
      if ((await request("/")).status === 200) return;
    } catch {
      // A connection refusal is expected while this isolated server boots.
    }
    await delay(100);
  }
  throw new Error(`Standalone server did not become ready: ${logs}`);
});

after(async () => {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([closed, delay(5_000, undefined, { ref: false })]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await closed;
  }
});

test("standalone server resolves a patched stable Next.js", (context) => {
  const { version } = runtimeRequire("next/package.json");
  assertVersionAtLeast(version, "16.3.8", "Next.js");
  context.diagnostic(`Next.js=${version}`);
});

for (const path of [
  "/",
  "/equity",
  "/range",
  "/ev",
  "/solver",
  "/trainer",
  "/research",
  "/experiments",
  "/about",
]) {
  test(`production ${path} serves HTML with security headers`, async () => {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html\b/);
    assert.match(response.body, /<title>PokerLab/);
    assertSecurityHeaders(response);
  });
}

test("HTML-referenced JavaScript and CSS are included in the final image", async () => {
  const { body } = await request("/");
  const paths = new Set(
    Array.from(body.matchAll(/(?:src|href)="([^"\s]+)"/g), ([, path]) =>
      path.replaceAll("&amp;", "&"),
    ).filter((path) => path.startsWith("/_next/static/")),
  );
  for (const extension of ["js", "css"]) {
    assert.ok(
      [...paths].some((path) =>
        new URL(path, origin).pathname.endsWith(`.${extension}`),
      ),
      `HTML must reference at least one ${extension} asset`,
    );
  }
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok(response.body.length > 0, path);
    assert.match(response.headers.get("cache-control"), /\bimmutable\b/, path);
    if (new URL(path, origin).pathname.endsWith(".js")) {
      assert.match(response.headers.get("content-type"), /javascript/, path);
    } else if (new URL(path, origin).pathname.endsWith(".css")) {
      assert.match(response.headers.get("content-type"), /^text\/css\b/, path);
    }
  }
});

test("missing routes return 404 with security headers", async () => {
  const response = await request("/pokerlab-runtime-test-missing");
  assert.equal(response.status, 404);
  assertSecurityHeaders(response);
});

test("image optimization rejects non-allowlisted remote URLs", async () => {
  const query = new URLSearchParams({
    url: "https://example.invalid/pokerlab-test.png",
    w: "64",
    q: "75",
  });
  const response = await request(`/_next/image?${query}`);
  assert.equal(response.status, 400);
  assert.match(response.body, /not allowed/i);
});

test("development MCP endpoint is unavailable in production", async () => {
  for (const method of ["GET", "POST"]) {
    const response = await request("/_next/mcp", { method });
    assert.equal(response.status, 404, method);
  }
});
