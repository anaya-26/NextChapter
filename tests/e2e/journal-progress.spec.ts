import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

test("check in, reflect privately, review the week, see progress and run an experiment", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, { name: "Sana Shaikh" });

  // One-tap check-in from Today.
  await page.goto("/today");
  await page.getByRole("group", { name: "How are you feeling today?" }).getByText("Good").click();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText(/Checked in today/)).toBeVisible();

  // A private reflection with a photo; the AI can't read it while journal access is off.
  await page.goto("/journal");
  await expect(page.getByText("Private to you")).toBeVisible();
  await page.getByLabel("How did it go?").fill("Worked through current electricity today. Ohm's law finally makes sense after drawing the V–I graph myself, and I solved six numericals without looking at the answers. Kirchhoff's loop rule still confuses me with signs.");
  await page.getByLabel("What was difficult? (optional)").fill("Sign conventions in Kirchhoff's loop rule");
  await page.locator('input[name="photos"]').setInputFiles({ name: "graph.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("switch", { name: "Let the AI read this entry" })).toBeDisabled();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page).toHaveURL(/\/journal\/[a-z0-9]+$/);
  await expect(page.getByRole("paragraph").filter({ hasText: /finally makes sense/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo attached to this entry" })).toBeVisible();
  await expect(page.getByText("Private from the AI")).toBeVisible();

  await page.getByRole("link", { name: "Study log" }).click();
  await expect(page.getByRole("heading", { name: "Study log" })).toBeVisible();

  await page.getByRole("link", { name: "Weekly review" }).click();
  await page.getByRole("button", { name: "Review this week" }).click();
  await expect(page.getByText("Weekly review ready")).toBeVisible();
  await expect(page.getByText("Simulated AI · AI review")).toBeVisible();
  await expect(page.getByText(/journal access is off/)).toBeVisible();

  // Progress: level and badges, then the quiet interface hides them.
  await page.goto("/progress");
  await expect(page.getByText("Level", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Study time per week" })).toBeVisible();
  await expect(page.getByText(/Earned/).first()).toBeVisible();
  await page.getByRole("switch", { name: "Quiet interface" }).click();
  await expect(page.getByText("Level", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Real improvement", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Quiet interface" }).click();
  await expect(page.getByText("Level", { exact: true })).toBeVisible();

  // An experiment from a template.
  await page.getByRole("link", { name: "Experiments" }).click();
  const phone = page.getByRole("listitem").filter({ hasText: "Phone in another room" });
  await phone.getByRole("button", { name: "Try this" }).click();
  await expect(page.getByRole("heading", { name: "Ready to start" })).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByText("Experiment started — good luck!")).toBeVisible();
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
});
