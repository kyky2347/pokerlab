import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import { assertVersionAtLeast } from "./assert-version.mjs";

const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const jsdomRequire = createRequire(webRequire.resolve("jsdom/package.json"));
const eslintRequire = createRequire(webRequire.resolve("eslint-config-next"));
const hooksRequire = createRequire(
  eslintRequire.resolve("eslint-plugin-react-hooks"),
);
const validationRequire = createRequire(
  hooksRequire.resolve("zod-validation-error"),
);
const { fetch: undiciFetch, MockAgent } = jsdomRequire("undici");

test("jsdom resolves patched undici on the supported 8.x branch", () => {
  const { version } = jsdomRequire("undici/package.json");
  assert.match(version, /^8\.\d+\.\d+$/);
  assertVersionAtLeast(version, "8.12.2", "undici");
});

for (const [consumer, consumerRequire] of [
  ["eslint-plugin-react-hooks", hooksRequire],
  ["zod-validation-error", validationRequire],
]) {
  test(`${consumer} resolves patched Zod on the supported 4.x branch`, () => {
    const { version } = consumerRequire("zod/package.json");
    assert.match(version, /^4\.\d+\.\d+$/);
    assertVersionAtLeast(version, "4.6.6", "Zod");
  });
}

for (const bound of ["max", "length"]) {
  test(`Zod array ${bound} rejects oversized input before visiting elements`, () => {
    const { z } = hooksRequire("zod");
    let visited = 0;
    const element = z.string().superRefine(() => {
      visited += 1;
    });
    const schema = z.array(element)[bound](2);
    // A small fixture tests early rejection, not a memory-exhaustion payload.
    const result = schema.safeParse(Array(100).fill("fixture"));
    assert.equal(result.success, false);
    assert.equal(visited, 0);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
    assert.deepEqual(schema.parse(["first", "second"]), ["first", "second"]);
    assert.equal(visited, 2);
  });
}

for (const algorithm of ["sha256", "sha384", "sha512"]) {
  for (const token of [
    algorithm,
    algorithm.toUpperCase(),
    `Sha${algorithm.slice(3)}`,
  ]) {
    test(`undici verifies ${token} integrity rather than skipping the digest`, async () => {
      const mock = new MockAgent();
      mock.disableNetConnect();
      const body = "PokerLab trusted fixture";
      mock
        .get("https://pokerlab.invalid")
        .intercept({ path: "/asset", method: "GET" })
        .reply(200, body)
        .times(2);
      const digest = (value) =>
        createHash(algorithm).update(value).digest("base64");
      try {
        const response = await undiciFetch("https://pokerlab.invalid/asset", {
          dispatcher: mock,
          integrity: `${token}-${digest(body)}`,
        });
        assert.equal(await response.text(), body);
        await assert.rejects(
          undiciFetch("https://pokerlab.invalid/asset", {
            dispatcher: mock,
            integrity: `${token}-${digest("different body")}`,
          }),
          (error) => {
            assert.match(error.cause?.message ?? "", /integrity mismatch/i);
            return true;
          },
        );
        mock.assertNoPendingInterceptors();
      } finally {
        await mock.close();
      }
    });
  }
}
