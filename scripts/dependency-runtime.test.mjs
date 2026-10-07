import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";

import { assertVersionAtLeast } from "./assert-version.mjs";

const require = createRequire(import.meta.url);
const launcherPackage = require.resolve("concurrently/package.json");
const launcherRequire = createRequire(launcherPackage);
// Resolve the actual transitive copy used by the launcher, not a test-only copy.
const { parse, quote } = launcherRequire("shell-quote");

test("launcher resolves a patched shell-quote", () => {
  assertVersionAtLeast(
    launcherRequire("shell-quote/package.json").version,
    "1.11.0",
    "shell-quote",
  );
});

for (const [name, terminator] of Object.entries({
  LF: "\n",
  CR: "\r",
  "LINE SEPARATOR": "\u2028",
  "PARAGRAPH SEPARATOR": "\u2029",
})) {
  test(`shell-quote rejects ${name} after a comment token`, () => {
    // Check rejection only. Never pass this potentially injectable string to a shell.
    assert.throws(
      () =>
        quote([
          "echo",
          "safe",
          { comment: "boundary" },
          `value${terminator}unexpected`,
        ]),
      TypeError,
    );
  });
}

test("ordinary quoted arguments round-trip without interpretation", () => {
  const arguments_ = [
    "node",
    "two words",
    "quote'\"",
    "$HOME",
    ";",
    "#fragment",
    "a\nb",
    "",
  ];
  assert.deepEqual(parse(quote(arguments_)), arguments_);
});

test("concurrently still launches both fixed commands successfully", () => {
  const cli = resolve(
    dirname(launcherPackage),
    launcherRequire("./package.json").bin.concurrently,
  );
  // Only fixed, developer-owned commands are executed. They open no ports and
  // never interpolate user data, environment values, or the rejection fixtures.
  const commands = ["POKERLAB_API_SMOKE", "POKERLAB_WEB_SMOKE"].map((marker) =>
    quote([
      process.execPath,
      "-e",
      `process.stdout.write(${JSON.stringify(marker)})`,
    ]),
  );
  const result = spawnSync(process.execPath, [cli, "--raw", ...commands], {
    encoding: "utf8",
    timeout: 15_000,
    shell: false,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  for (const marker of ["POKERLAB_API_SMOKE", "POKERLAB_WEB_SMOKE"]) {
    assert.ok(result.stdout.includes(marker), `Missing output from ${marker}`);
  }
});

test("security floors reject downgrades, unknown versions, and prereleases", () => {
  for (const version of [
    undefined,
    "unknown",
    "1.10.99",
    "0.99.0",
    "1.11.0-rc.1",
  ]) {
    assert.throws(() => assertVersionAtLeast(version, "1.11.0", "fixture"));
  }
  for (const version of ["1.11.0", "1.11.1", "1.12.0", "2.0.0"]) {
    assertVersionAtLeast(version, "1.11.0", "fixture");
  }
});
