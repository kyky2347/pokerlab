import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { readSession, repositoryRoot } from "../../scripts/e2e/session.mjs";

const session = readSession();
const webRoot = join(repositoryRoot, "apps/web");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // Keep browser jobs within the isolated API's two-solver capacity.
  workers: 2,
  outputDir: join(webRoot, "test-results", session.id),
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: join(webRoot, "playwright-report", session.id),
      },
    ],
  ],
  use: {
    baseURL: session.webURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node ../../scripts/e2e/server.mjs api",
      cwd: webRoot,
      url: `${session.apiURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "node ../../scripts/e2e/server.mjs web",
      cwd: webRoot,
      url: session.webURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
