import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createSession,
  repositoryRoot,
  sessionEnvironment,
} from "./session.mjs";

export async function runCommand(session, command, args, options = {}) {
  let interrupted;
  let child;
  const interrupt = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    // Playwright's task runner handles SIGINT for full server/worker teardown.
    // Normalize SIGTERM too, but preserve the original signal's exit code.
    // A detached CLI receives one signal; wait before deleting its private data.
    child?.kill("SIGINT");
  };
  const onInt = () => interrupt("SIGINT");
  const onTerm = () => interrupt("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  try {
    const code = await new Promise((resolve, reject) => {
      child = spawn(command, args, {
        cwd: join(repositoryRoot, "apps/web"),
        stdio: "inherit",
        detached: process.platform !== "win32",
        ...options,
        env: sessionEnvironment(session, options.env ?? process.env),
        shell: false,
      });
      child.once("error", reject);
      child.once("close", (code, signal) =>
        resolve(code ?? (signal === "SIGINT" ? 130 : 1)),
      );
    });
    return interrupted === "SIGINT"
      ? 130
      : interrupted === "SIGTERM"
        ? 143
        : code;
  } finally {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    session.cleanup();
  }
}

export async function main(args = process.argv.slice(2)) {
  if (
    args.some(
      (arg) =>
        arg.startsWith("-c") ||
        arg === "--config" ||
        arg.startsWith("--config="),
    )
  ) {
    throw new Error(
      "The isolated runner owns --config / 隔离运行器管理配置文件",
    );
  }
  const require = createRequire(join(repositoryRoot, "apps/web/package.json"));
  const cli = require.resolve("@playwright/test/cli");
  const session = await createSession();
  console.log(`Isolated E2E / 隔离验收: ${session.webURL} → ${session.apiURL}`);
  return runCommand(session, process.execPath, [
    cli,
    "test",
    "--config",
    join(repositoryRoot, "apps/web/playwright.config.ts"),
    ...args,
  ]);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
