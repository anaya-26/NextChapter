import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("onboarding, privacy for minors, memory controls and goals", async ({ page }) => {
  await signUp(page, { name: "Riya Sharma" });
  await expect(page).toHaveURL(/\/onboarding/);

  // Step 1 — about you (a 16-year-old)
  await page.getByLabel("What should NextChapter call you?").fill("Riya");
  await page.getByText("16–17", { exact: true }).click();
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 2 — education
  await expect(page.getByRole("heading", { name: "Your education" })).toBeVisible();
  await page.getByText("Higher secondary (Class 11–12)").click();
  await page.getByLabel("Course or stream").fill("Class 12 Science (PCM)");
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 3 — exams & subjects via suggestion chips
  await expect(page.getByRole("heading", { name: "Exams and subjects" })).toBeVisible();
  await page.getByRole("button", { name: "JEE Main" }).click();
  await page.getByRole("button", { name: "Physics" }).click();
  await page.getByRole("button", { name: "Mathematics" }).click();
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 4 — time + a commitment
  await expect(page.getByRole("heading", { name: "Your time" })).toBeVisible();
  await page.getByLabel("Hours per week you'd like to study").fill("14");
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 5 — goals
  await expect(page.getByRole("heading", { name: "Goals and interests" })).toBeVisible();
  await page.getByText("Exploring options").click();
  await page.getByLabel("One goal for the next few weeks (optional)").fill("Finish Electrostatics before the unit test");
  await page.getByRole("button", { name: "Save & continue" }).click();

  // Step 6 — companion; pattern noticing is locked for a minor without consent
  await expect(page.getByRole("heading", { name: "Your companion" })).toBeVisible();
  await expect(page.getByLabel(/Let NextChapter notice patterns/)).toBeDisabled();
  await page.getByRole("button", { name: "Finish", exact: true }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("Finish Electrostatics before the unit test")).toBeVisible();
  await expect(page.getByText(/some optional features stay off until a parent or guardian/)).toBeVisible();

  // Memory: add, correct, delete
  await page.goto("/settings/memory");
  await page.getByLabel("Statement").fill("I learn best with diagrams");
  await page.getByRole("button", { name: "Remember" }).click();
  await expect(page.getByText("I learn best with diagrams")).toBeVisible();
  await expect(page.getByText("Stated by you")).toBeVisible();
  await page.getByRole("button", { name: "Correct this" }).click();
  await page.getByLabel("Corrected statement").fill("I learn best with diagrams and worked examples");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("I learn best with diagrams and worked examples")).toBeVisible();
  await expect(page.getByText("Originally: I learn best with diagrams")).toBeVisible();
  await page.getByRole("button", { name: "Delete this memory" }).click();
  await expect(page.getByText("Nothing remembered yet")).toBeVisible();

  // Privacy: locked switches for minors
  await page.goto("/settings/privacy");
  await expect(page.getByRole("switch", { name: "Notice patterns" })).toBeDisabled();
  await expect(page.getByText("This records a declaration, not verified consent")).toBeVisible();

  // Goals: milestone on the current priority
  await page.goto("/goals");
  await page.getByLabel("New milestone").first().fill("Revise Coulomb's law numericals");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByText("Revise Coulomb's law numericals")).toBeVisible();
  await page.getByRole("button", { name: "Mark Revise Coulomb's law numericals done" }).click();
  await expect(page.getByRole("button", { name: "Mark Revise Coulomb's law numericals not done" })).toBeVisible();
});
