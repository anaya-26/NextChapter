import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const syllabusText = readFileSync("tests/fixtures/sample-syllabus.txt", "utf8");

test("upload a syllabus, correct it, confirm, and use the roadmap", async ({ page }) => {
  await signUp(page, { name: "Kabir Rao" });
  await page.goto("/learn");
  await page.getByLabel("Subject").fill("Physics");
  await page.getByRole("button", { name: "Add subject" }).click();
  await expect(page).toHaveURL(/\/syllabus\/new/);

  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Syllabus text").fill(syllabusText);
  await page.getByRole("button", { name: "Read my syllabus" }).click();

  // Background extraction (simulated AI) → correction step.
  await expect(page.getByRole("heading", { name: "Check what Kadam found" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Simulated AI · extraction/)).toBeVisible();
  const ohmField = page.locator('input[value="Ohm\'s law"]');
  await ohmField.fill("Ohm's law and V–I characteristics");
  await page.getByRole("button", { name: "Confirm syllabus" }).click();

  // Roadmap with simulated enrichment and next step.
  await expect(page).toHaveURL(/\/learn\/[^/]+\?confirmed=1/);
  await expect(page.getByText("Syllabus confirmed — roadmap ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ohm's law and V–I characteristics" }).first()).toBeVisible();
  await expect(page.getByText("Background · Simulated suggestion").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Next step")).toBeVisible();

  // Skip a familiar topic and reorder another.
  await page.getByRole("button", { name: "Options for Drift velocity" }).click();
  await page.getByRole("menuitem", { name: "I already know this — skip" }).click();
  await expect(page.getByText("Skipped — familiar")).toBeVisible();
  await page.getByRole("link", { name: "Syllabus requirements only" }).click();
  await expect(page.getByText("Background · Simulated suggestion")).toHaveCount(0);
});
