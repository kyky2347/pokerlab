import assert from "node:assert/strict";

// Refuse unknown/prerelease native versions instead of silently treating them
// as patched. These guards supplement, not replace, dependency audits.
export function assertVersionAtLeast(actual, minimum, label) {
  assert.match(
    actual ?? "",
    /^\d+\.\d+\.\d+$/,
    `${label}: unrecognized release version`,
  );
  const parts = actual.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  const difference = parts.findIndex((part, index) => part !== required[index]);
  assert.ok(
    difference === -1 || parts[difference] > required[difference],
    `${label} ${actual} is below the security floor ${minimum}`,
  );
}
