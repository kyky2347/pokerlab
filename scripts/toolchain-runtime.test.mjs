import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertVersionAtLeast } from "./assert-version.mjs";

const webRequire = createRequire(
  resolve(fileURLToPath(new URL("../apps/web/package.json", import.meta.url))),
);
const vitestRequire = createRequire(webRequire.resolve("vitest/package.json"));
const mockerRequire = createRequire(
  vitestRequire.resolve("@vitest/mocker/package.json"),
);
const nextLintRequire = createRequire(webRequire.resolve("eslint-config-next"));
const typescriptLintRequire = createRequire(
  nextLintRequire.resolve("typescript-eslint"),
);
const parserRequire = createRequire(
  typescriptLintRequire.resolve("@typescript-eslint/parser"),
);
const estreeRequire = createRequire(
  parserRequire.resolve("@typescript-eslint/typescript-estree"),
);

function patchedMinimatch() {
  assertVersionAtLeast(
    estreeRequire("minimatch/package.json").version,
    "11.0.1",
    "TypeScript minimatch",
  );
  return estreeRequire("minimatch");
}

test("TypeScript lint glob matching resolves the patched modern API", () => {
  const { Minimatch, minimatch } = patchedMinimatch();
  const files = new Minimatch("src/**/*.{ts,tsx}", { dot: true });
  assert.equal(files.match("src/components/ev-chart.tsx"), true);
  assert.equal(files.match("src/.internal/helper.ts"), true);
  assert.equal(files.match("src/components/chart.js"), false);
  assert.equal(minimatch("apps/web/tsconfig.json", "**/tsconfig.json"), true);
});

test("modern glob preprocessing bounds repeated globstar-parent expansion", () => {
  const { Minimatch } = patchedMinimatch();
  // Bounded even on the old implementation (at most 256 candidates), while
  // still detecting the security fix. Do not run an unbounded DoS fixture.
  const pattern = Array(8).fill("**/../a/b").join("/");
  const matcher = new Minimatch(pattern, {
    optimizationLevel: 2,
    braceExpandMax: 64,
  });
  assert.equal(matcher.set.length, 64);
  const ordinary = new Minimatch("**/../a/b/**/../c/d", {
    optimizationLevel: 2,
  });
  assert.equal(ordinary.set.length, 4);
  assert.equal(ordinary.match("../a/b/../c/d"), true);
  assert.equal(ordinary.match("x/a/b/y/c/d"), true);
});

test("modern glob preprocessing skips pairwise deduplication for large sets", () => {
  const { Minimatch } = patchedMinimatch();
  const matcher = new Minimatch("{x,*}/{0..999}", { optimizationLevel: 2 });
  assert.equal(matcher.set.length, 2000);
  assert.equal(matcher.match("x/5"), true);
  assert.equal(matcher.match("y/999"), true);
  assert.equal(matcher.match(".y/5"), false);
});

test("ESLint retains its legacy callable minimatch API", () => {
  const eslintRequire = createRequire(
    webRequire.resolve("eslint/package.json"),
  );
  const minimatch = eslintRequire("minimatch");
  assert.match(eslintRequire("minimatch/package.json").version, /^3\./);
  assert.equal(typeof minimatch, "function");
  assert.equal(minimatch("src/page.tsx", "src/**/*.tsx"), true);
  assert.equal(minimatch("src/page.js", "src/**/*.tsx"), false);
  // The registry advisory's broad <11.0.1 range includes this branch, but the
  // cited optimization-level-2 preprocessing methods are absent here.
  assert.equal(minimatch.Minimatch.prototype.firstPhasePreProcess, undefined);
  assert.equal(minimatch.Minimatch.prototype.secondPhasePreProcess, undefined);
});

test("Vitest resolves its patched matching mocker on the supported 4.1 branch", () => {
  const { version } = webRequire("vitest/package.json");
  assert.match(version, /^4\.1\.\d+$/);
  assertVersionAtLeast(version, "4.1.12", "Vitest");
  assert.equal(vitestRequire("@vitest/mocker/package.json").version, version);
});

test("web and ESLint resolve the patched stable Next.js release together", () => {
  const { version } = webRequire("next/package.json");
  assertVersionAtLeast(version, "16.4.1", "Next.js");
  // eslint-config-next exports dist/index.js, but not its package.json subpath.
  const eslintRequire = createRequire(webRequire.resolve("eslint-config-next"));
  const configPackage = eslintRequire("../package.json");
  assert.equal(configPackage.name, "eslint-config-next");
  assert.equal(configPackage.version, version);
  assert.equal(
    eslintRequire("@next/eslint-plugin-next/package.json").version,
    version,
  );
});

for (const [consumer, consumerRequire] of [
  ["vitest", vitestRequire],
  ["@vitest/mocker", mockerRequire],
]) {
  test(`${consumer} resolves patched Vite on the supported 8.2 branch`, () => {
    const { version } = consumerRequire("vite/package.json");
    // A simple >=8.2.4 floor would incorrectly permit known-affected 8.3.0–8.3.2.
    // Moving maintenance branches requires an explicit advisory review.
    assert.match(version, /^8\.2\.\d+$/);
    assertVersionAtLeast(version, "8.2.4", "Vite");
  });
}

test("patched Vite transforms a trusted TypeScript module without a server", async () => {
  const { transformWithOxc } = await import(
    pathToFileURL(vitestRequire.resolve("vite")).href
  );
  const result = await transformWithOxc(
    "const answer: number = 42; export { answer };",
    "pokerlab-toolchain-fixture.ts",
  );
  // Only this fixed repository-owned fixture is evaluated: no editor, shell,
  // user-supplied source, listening socket or Windows exploit is launched.
  const transformed = await import(
    `data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`
  );
  assert.equal(transformed.answer, 42);
});
