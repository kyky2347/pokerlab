import { expect, test } from "@playwright/test";

test("mobile navigation opens and the page does not overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Equity Lab" })).toBeVisible();
  await page.getByRole("link", { name: "EV Lab" }).click();
  await expect(page.getByRole("heading", { name: "EV Lab" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
