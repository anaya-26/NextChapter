import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const PAGES = ["/today", "/learn", "/learn/review", "/learn/mistakes", "/calendar", "/calendar/plan", "/calendar/restart", "/calendar/sync", "/journal", "/journal/log", "/journal/review", "/goals", "/goals/career", "/goals/opportunities", "/goals/opportunities?view=saved", "/goals/portfolio", "/goals/portfolio/new", "/goals/cv", "/goals/interview", "/companion", "/progress", "/progress/experiments", "/settings", "/settings/privacy", "/settings/memory", "/settings/integrations", "/notifications"];

test("every main page fits a phone screen without sideways scrolling, and check-in works on mobile", async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, { name: "Dev Patel" });
  const width = page.viewportSize()!.width;
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(width);
  }
  await page.goto("/today");
  await page.getByRole("group", { name: "How are you feeling today?" }).getByText("Okay").click();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText(/Checked in today/)).toBeVisible();
  // Bottom navigation reaches the main spaces.
  await page.getByRole("navigation").getByRole("link", { name: "Journal" }).click();
  await expect(page).toHaveURL(/\/journal$/);
});
