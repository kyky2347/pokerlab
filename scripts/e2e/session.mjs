import { createServer } from "node:net";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const prefix = ".pokerlab-e2e-";
const sourceFiles = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  "src",
  "public",
];

async function allocatePorts() {
  const servers = [];
  try {
    const ports = [];
    for (let index = 0; index < 2; index += 1) {
      const server = createServer();
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      ports.push(server.address().port);
    }
    return ports;
  } finally {
    await Promise.all(
      servers
        .filter((server) => server.listening)
        .map((server) => new Promise((resolve) => server.close(resolve))),
    );
  }
}

function describe(directory, ports, root) {
  // SQLAlchemy treats '?' as the URL query delimiter, not part of a SQLite
  // filename. Refuse it instead of risking a database outside the run directory.
  if (directory.includes("?")) {
    throw new Error(
      "E2E requires a repository path without '?' / 隔离测试要求仓库路径不含问号",
    );
  }
  return {
    directory,
    id: basename(directory),
    webDirectory: join(directory, "web"),
    apiDirectory: join(root, "apps/api"),
    webPort: ports[0],
    apiPort: ports[1],
    webURL: `http://127.0.0.1:${ports[0]}`,
    apiURL: `http://127.0.0.1:${ports[1]}`,
    databaseURL: `sqlite:///${join(directory, "test.db").replaceAll("\\", "/")}`,
  };
}

export async function createSession(root = repositoryRoot) {
  root = realpathSync(root);
  const ports = await allocatePorts();
  const directory = mkdtempSync(join(root, prefix));
  // Only this freshly allocated directory is ever removed, never a caller's
  // DATABASE_URL, .next folder, or an environment-provided cleanup target.
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const session = describe(directory, ports, root);
    mkdirSync(session.webDirectory);
    const web = join(root, "apps/web");
    for (const name of sourceFiles) {
      // Next's public/ directory is optional; Git omits an empty one on clone.
      if (name === "public" && !existsSync(join(web, name))) continue;
      cpSync(join(web, name), join(session.webDirectory, name), {
        recursive: true,
      });
    }
    // Share installed packages, not generated files or developer .env files.
    symlinkSync(
      join(web, "node_modules"),
      join(session.webDirectory, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    writeFileSync(
      join(directory, "session.json"),
      JSON.stringify({ version: 1, ports }),
      { mode: 0o600, flag: "wx" },
    );
    return { ...session, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function readSession(env = process.env, root = repositoryRoot) {
  const directory = env.POKERLAB_E2E_RUN_DIRECTORY;
  const message =
    "Use pnpm --filter web test:e2e for an isolated run / 请使用隔离测试命令";
  if (
    !directory ||
    dirname(directory) !== realpathSync(root) ||
    !/^\.pokerlab-e2e-[A-Za-z0-9]{6}$/.test(basename(directory)) ||
    realpathSync(directory) !== directory
  ) {
    throw new Error(message);
  }
  const { version, ports } = JSON.parse(
    readFileSync(join(directory, "session.json"), "utf8"),
  );
  if (
    version !== 1 ||
    !Array.isArray(ports) ||
    ports.length !== 2 ||
    ports.some(
      (port) => !Number.isInteger(port) || port < 1024 || port > 65535,
    ) ||
    ports[0] === ports[1]
  ) {
    throw new Error(message);
  }
  return describe(directory, ports, realpathSync(root));
}

export function sessionEnvironment(session, env = process.env) {
  return {
    ...env,
    POKERLAB_E2E_RUN_DIRECTORY: session.directory,
    DATABASE_URL: session.databaseURL,
    NEXT_PUBLIC_API_URL: session.apiURL,
    CORS_ORIGINS: session.webURL,
    NODE_ENV: "development",
    POKERLAB_MAX_MONTE_CARLO: "500000",
    POKERLAB_MAX_SOLVER_ITERATIONS: "5000",
    POKERLAB_MAX_CONCURRENT_SOLVERS: "2",
  };
}
