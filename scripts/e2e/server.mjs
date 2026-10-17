import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { readSession, repositoryRoot, sessionEnvironment } from "./session.mjs";

const session = readSession();
const require = createRequire(join(repositoryRoot, "apps/web/package.json"));
const mode = process.argv[2];
if (mode !== "api" && mode !== "web")
  throw new Error("Expected api or web / 需要 api 或 web");
const command = mode === "api" ? "uv" : process.execPath;
const args =
  mode === "api"
    ? [
        "run",
        "uvicorn",
        "pokerlab_api.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(session.apiPort),
      ]
    : [
        require.resolve("next/dist/bin/next"),
        "dev",
        session.webDirectory,
        "--hostname",
        "127.0.0.1",
        "--port",
        String(session.webPort),
      ];
// Stay in Playwright's server process group so its teardown owns all descendants.
const child = spawn(command, args, {
  cwd: mode === "api" ? session.apiDirectory : session.webDirectory,
  env: sessionEnvironment(session),
  stdio: "inherit",
  shell: false,
});
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("close", (code) => {
  process.exitCode = code ?? 1;
});
