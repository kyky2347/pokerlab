import { expect, test } from "@playwright/test";

test("home and primary labs form a working journey", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Probability/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open Equity Lab" }).click();
  await page.getByRole("button", { name: "Calculate equity" }).click();
  await expect(page.getByText("Exact equity")).toBeVisible();
  await expect(page.getByText("Conditional turn explorer")).toBeVisible();

  await page.goto("/range");
  await page.getByRole("button", { name: "A5s 0 percent" }).click();
  await expect(
    page.getByRole("button", { name: "A5s 25 percent" }),
  ).toBeVisible();

  await page.goto("/trainer");
  await expect(page.getByText(/seed 20250902/)).toBeVisible();
  await page.getByRole("button", { name: "Lock answer" }).click();
  await expect(page.getByText("Actual equity")).toBeVisible();

  await page.goto("/ev");
  await expect(page.getByText("Required equity")).toBeVisible();
  await expect(page.getByText("EV against hero equity")).toBeVisible();

  await page.goto("/research");
  await expect(page.getByText("Prior and posterior density")).toBeVisible();
  await expect(page.getByText(/Posterior Beta/)).toBeVisible();
});

test("small CFR job completes with a real strategy", async ({ page }) => {
  await page.goto("/solver");
  await expect(page.getByText("Kuhn Poker fixture")).toBeVisible();
  await page.getByRole("button", { name: "Run solver" }).click();
  await expect(page.getByText("Average regret")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText("OOP root strategy matrix")).toBeVisible();
});
