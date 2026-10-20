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
