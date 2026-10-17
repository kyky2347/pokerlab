import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer as createHTTPServer } from "node:http";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  openSync,
  closeSync,
} from "node:fs";
import test from "node:test";

import {
  createSession,
  readSession,
  sessionEnvironment,
  repositoryRoot,
} from "./session.mjs";
import { main, runCommand } from "./run.mjs";

const require = createRequire(join(repositoryRoot, "apps/web/package.json"));
const playwrightCLI = require.resolve("@playwright/test/cli");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pokerlab-e2e-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    "apps/api",
    "apps/web/src",
    "apps/web/public",
    "apps/web/node_modules",
    "apps/web/.next",
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const name of [
    "package.json",
    "tsconfig.json",
    "next.config.ts",
    "postcss.config.mjs",
  ]) {
    writeFileSync(join(root, "apps/web", name), `fixture ${name}`);
  }
  writeFileSync(join(root, "apps/web/src/page.tsx"), "source snapshot");
  writeFileSync(join(root, "apps/web/public/icon.svg"), "asset snapshot");
  writeFileSync(join(root, "apps/web/.env.local"), "PRIVATE_SENTINEL");
  writeFileSync(join(root, "apps/web/.next/developer-build"), "untouched");
  writeFileSync(
    join(root, "apps/api/pokerlab.db"),
    "developer ledger sentinel",
  );
  return root;
}

test("fresh runs isolate source, build output, database and ports without copying secrets", async (t) => {
  const root = fixture(t);
  const first = await createSession(root);
  const second = await createSession(root);
  t.after(first.cleanup);
  t.after(second.cleanup);
  assert.notEqual(first.directory, second.directory);
  for (const session of [first, second]) {
    assert.notEqual(session.webPort, session.apiPort);
    assert.match(session.webURL, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(
      session.databaseURL,
      `sqlite:///${join(session.directory, "test.db").replaceAll("\\", "/")}`,
    );
    assert.equal(
      readFileSync(join(session.webDirectory, "src/page.tsx"), "utf8"),
      "source snapshot",
    );
    assert.equal(
      readFileSync(join(session.webDirectory, "public/icon.svg"), "utf8"),
      "asset snapshot",
    );
    assert.equal(existsSync(join(session.webDirectory, ".env.local")), false);
    assert.equal(existsSync(join(session.webDirectory, ".next")), false);
    assert.ok(
      statSync(join(session.webDirectory, "node_modules")).isDirectory(),
    );
    if (process.platform !== "win32")
      assert.equal(statSync(session.directory).mode & 0o777, 0o700);
    const env = sessionEnvironment(session, {
      DATABASE_URL: "postgresql://must-not-connect.invalid/private",
      NEXT_PUBLIC_API_URL: "https://must-not-contact.invalid",
      CORS_ORIGINS: "https://must-not-trust.invalid",
      NODE_ENV: "production",
      POKERLAB_MAX_MONTE_CARLO: "1",
      POKERLAB_MAX_SOLVER_ITERATIONS: "1",
      POKERLAB_MAX_CONCURRENT_SOLVERS: "1",
      PATH: "retained",
    });
    assert.equal(env.DATABASE_URL, session.databaseURL);
    assert.equal(env.NEXT_PUBLIC_API_URL, session.apiURL);
    assert.equal(env.CORS_ORIGINS, session.webURL);
    assert.equal(env.NODE_ENV, "development");
    assert.equal(env.POKERLAB_MAX_MONTE_CARLO, "500000");
    assert.equal(env.POKERLAB_MAX_SOLVER_ITERATIONS, "5000");
    assert.equal(env.POKERLAB_MAX_CONCURRENT_SOLVERS, "2");
    assert.equal(env.PATH, "retained");
    assert.equal(readSession(env, root).directory, session.directory);
  }
  writeFileSync(join(first.webDirectory, "src/page.tsx"), "test-only mutation");
  first.cleanup();
  first.cleanup(); // Idempotent; must not touch any sibling or original project file.
  assert.equal(existsSync(first.directory), false);
  assert.equal(existsSync(second.directory), true);
  assert.equal(
    readFileSync(join(root, "apps/web/src/page.tsx"), "utf8"),
    "source snapshot",
  );
  assert.equal(
    readFileSync(join(root, "apps/web/.next/developer-build"), "utf8"),
    "untouched",
  );
  assert.equal(
    readFileSync(join(root, "apps/api/pokerlab.db"), "utf8"),
    "developer ledger sentinel",
  );
});

test("port discovery does not reuse an already listening service", async (t) => {
  const root = fixture(t);
  const existing = createServer();
  existing.listen(0, "127.0.0.1");
  await once(existing, "listening");
  t.after(() => new Promise((resolve) => existing.close(resolve)));
  const session = await createSession(root);
  t.after(session.cleanup);
  assert.notEqual(session.webPort, existing.address().port);
  assert.notEqual(session.apiPort, existing.address().port);
  assert.equal(existing.listening, true);
});

test("partial setup failure removes only the newly created snapshot", async (t) => {
  const root = fixture(t);
  unlinkSync(join(root, "apps/web/next.config.ts"));
  await assert.rejects(createSession(root), { code: "ENOENT" });
  assert.deepEqual(readdirSync(root), ["apps"]);
  assert.equal(
    readFileSync(join(root, "apps/api/pokerlab.db"), "utf8"),
    "developer ledger sentinel",
  );
});

test("a fresh checkout does not require the optional public directory", async (t) => {
  const root = fixture(t);
  rmSync(join(root, "apps/web/public"), { recursive: true });
  const session = await createSession(root);
  t.after(session.cleanup);
  assert.equal(existsSync(join(session.webDirectory, "public")), false);
  assert.equal(
    readFileSync(join(session.webDirectory, "src/page.tsx"), "utf8"),
    "source snapshot",
  );
  assert.equal(
    readSession(sessionEnvironment(session), root).directory,
    session.directory,
  );
});

test(
  "ambiguous SQLite URL paths fail closed without leaving test data",
  { skip: process.platform === "win32" },
  async (t) => {
    const parent = fixture(t);
    const root = join(parent, "question?mark");
    mkdirSync(root);
    await assert.rejects(createSession(root), /path without '\?'/);
    assert.deepEqual(readdirSync(root), []);
    assert.equal(
      readFileSync(join(parent, "apps/api/pokerlab.db"), "utf8"),
      "developer ledger sentinel",
    );
  },
);

for (const env of [
  {},
  { POKERLAB_E2E_RUN_DIRECTORY: "/" },
  { POKERLAB_E2E_RUN_DIRECTORY: "relative" },
]) {
  test(`configuration rejects missing or unsafe run directory: ${JSON.stringify(env)}`, () => {
    assert.throws(() => readSession(env), /isolated run/);
  });
}

test("configuration rejects a symlinked run directory", async (t) => {
  const root = fixture(t);
  const session = await createSession(root);
  t.after(session.cleanup);
  const link = join(root, ".pokerlab-e2e-ABCDEF");
  symlinkSync(
    session.directory,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => readSession({ POKERLAB_E2E_RUN_DIRECTORY: link }, root),
    /isolated run/,
  );
});

for (const ports of [
  null,
  [],
  [1, 2],
  [8000, 8000],
  [65536, 9000],
  [8000.5, 9000],
  ["8000", 9000],
  [8000, 9000, 10000],
]) {
  test(`configuration rejects invalid port metadata: ${JSON.stringify(ports)}`, async (t) => {
    const root = fixture(t);
    const session = await createSession(root);
    t.after(session.cleanup);
    writeFileSync(
      join(session.directory, "session.json"),
      JSON.stringify({ version: 1, ports }),
    );
    assert.throws(
      () => readSession(sessionEnvironment(session), root),
      /isolated run/,
    );
  });
}

for (const arg of [
  "-c",
  "-cother.ts",
  "-c=other.ts",
  "--config",
  "--config=other.ts",
]) {
  test(`runner rejects config bypass: ${arg}`, async () => {
    await assert.rejects(main([arg]), /owns --config/);
  });
}

for (const code of [0, 7]) {
  test(`runner preserves exit code ${code} and cleans its private files`, async (t) => {
    const root = fixture(t);
    const session = await createSession(root);
    t.after(session.cleanup);
    const intListeners = process.listenerCount("SIGINT");
    const termListeners = process.listenerCount("SIGTERM");
    const result = await runCommand(
      session,
      process.execPath,
      [
        "-e",
        `
      const assert = require("node:assert/strict");
      assert.equal(process.env.DATABASE_URL, ${JSON.stringify(session.databaseURL)});
      assert.equal(process.env.NEXT_PUBLIC_API_URL, ${JSON.stringify(session.apiURL)});
      process.exitCode = ${code};
    `,
      ],
      {
        cwd: root,
        stdio: "ignore",
        env: { ...process.env, DATABASE_URL: "unrelated-ledger" },
      },
    );
    assert.equal(result, code);
    assert.equal(existsSync(session.directory), false);
    assert.equal(process.listenerCount("SIGINT"), intListeners);
    assert.equal(process.listenerCount("SIGTERM"), termListeners);
  });
}

test("failed child startup still cleans up and propagates the error", async (t) => {
  const root = fixture(t);
  const session = await createSession(root);
  t.after(session.cleanup);
  await assert.rejects(
    runCommand(session, join(root, "missing-command"), [], {
      cwd: root,
      stdio: "ignore",
    }),
    { code: "ENOENT" },
  );
  assert.equal(existsSync(session.directory), false);
});

test("direct Playwright invocation fails closed without an isolated session", () => {
  const env = { ...process.env };
  delete env.POKERLAB_E2E_RUN_DIRECTORY;
  const result = spawnSync(
    process.execPath,
    [playwrightCLI, "test", "--list"],
    {
      cwd: join(repositoryRoot, "apps/web"),
      env,
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Use pnpm --filter web test:e2e/);
});

test("actual browser configuration uses private URLs, reports and bounded workers", async (t) => {
  const session = await createSession();
  t.after(session.cleanup);
  const configuration = new URL(
    "../../apps/web/playwright.config.ts",
    import.meta.url,
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from "node:assert/strict";
    import config from ${JSON.stringify(configuration)};
    assert.equal(config.use.baseURL, ${JSON.stringify(session.webURL)});
    assert.equal(config.workers, Number(process.env.POKERLAB_MAX_CONCURRENT_SOLVERS));
    assert.equal(config.webServer.length, 2);
    assert.equal(config.webServer[0].url, ${JSON.stringify(session.apiURL + "/health")});
    assert.equal(config.webServer[1].url, ${JSON.stringify(session.webURL)});
    assert.ok(config.webServer.every(server => server.reuseExistingServer === false));
    assert.ok(config.outputDir.endsWith(${JSON.stringify(join("test-results", session.id))}));
    assert.ok(config.reporter[1][1].outputFolder.endsWith(${JSON.stringify(join("playwright-report", session.id))}));
  `,
    ],
    { env: sessionEnvironment(session), encoding: "utf8", timeout: 15_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test(
  "a service that occupies a selected port is rejected, never reused or stopped",
  { timeout: 20_000 },
  async (t) => {
    const root = fixture(t);
    const session = await createSession();
    t.after(session.cleanup);
    let requests = 0;
    const existing = createHTTPServer((_request, response) => {
      requests += 1;
      response.writeHead(200).end("unrelated service");
    });
    existing.listen(session.apiPort, "127.0.0.1");
    await once(existing, "listening");
    t.after(() => new Promise((resolve) => existing.close(resolve)));
    const log = join(root, "collision.log");
    const descriptor = openSync(log, "wx+", 0o600);
    let result;
    let output;
    try {
      result = await runCommand(
        session,
        process.execPath,
        [
          playwrightCLI,
          "test",
          "--project=desktop-chromium",
          "--grep=home and primary labs",
        ],
        { stdio: ["ignore", descriptor, descriptor] },
      );
      // Read the same open file, never re-resolve a path after the child exits.
      const bytes = Buffer.alloc(fstatSync(descriptor).size);
      assert.equal(
        readSync(descriptor, bytes, 0, bytes.length, 0),
        bytes.length,
      );
      output = bytes.toString("utf8");
    } finally {
      closeSync(descriptor);
    }
    assert.equal(result, 1);
    assert.match(output, /already used/);
    assert.ok(requests > 0);
    assert.equal(existing.listening, true);
    assert.equal(existsSync(session.directory), false);
  },
);

for (const [signal, expected] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  test(
    `runner forwards ${signal} and waits for cleanup`,
    { skip: process.platform === "win32", timeout: 15_000 },
    async (t) => {
      const root = fixture(t);
      const sessionModule = new URL("./session.mjs", import.meta.url).href;
      const runnerModule = new URL("./run.mjs", import.meta.url).href;
      const code = `
      import {createSession} from ${JSON.stringify(sessionModule)};
      import {runCommand} from ${JSON.stringify(runnerModule)};
      const session = await createSession(${JSON.stringify(root)});
      console.log(JSON.stringify({directory: session.directory}));
      process.exitCode = await runCommand(session, process.execPath, ["-e", ${JSON.stringify(`
        process.on("SIGINT", () => { console.log("CHILD_STOPPED_SIGINT"); process.exit(0); });
        process.on("SIGTERM", () => { console.log("CHILD_STOPPED_SIGTERM"); process.exit(0); });
        console.log("CHILD_READY");
        setInterval(() => {}, 1000);
      `)}], {cwd: ${JSON.stringify(root)}});
    `;
      const child = spawn(
        process.execPath,
        ["--input-type=module", "-e", code],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      t.after(() => {
        if (child.exitCode === null) child.kill("SIGTERM");
      });
      let output = "";
      const closed = once(child, "close");
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.stdout.on("data", (data) => {
          output += data;
          if (output.includes("CHILD_READY")) resolve();
        });
      });
      const { directory } = JSON.parse(output.split("\n")[0]);
      child.kill(signal);
      const [exitCode] = await closed;
      assert.equal(exitCode, expected);
      assert.ok(output.includes("CHILD_STOPPED_SIGINT"));
      assert.equal(output.includes("CHILD_STOPPED_SIGTERM"), false);
      assert.equal(existsSync(directory), false);
      assert.equal(
        readFileSync(join(root, "apps/api/pokerlab.db"), "utf8"),
        "developer ledger sentinel",
      );
    },
  );
}
