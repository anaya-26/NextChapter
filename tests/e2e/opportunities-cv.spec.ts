import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const POSTING = `Embedded Systems Intern
Company: Example Devices Pvt Ltd
Location: Bengaluru
Stipend: ₹10,000 per month
Apply by 15 Dec 2026

Skills required:
- Python
- Git and collaborative coding
- Enrolled in a B.Tech or B.Sc programme`;

test("approve a real achievement, save an opening, find gaps, plan, practise and tailor a CV", async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, { name: "Meera Iyer" });

  // Portfolio: a draft needs approval before any CV can use it.
  await page.goto("/goals/portfolio/new");
  await page.getByLabel("Title").fill("Plant-watering reminder bot");
  await page.getByLabel("What did you do?").fill("Wrote a Python script with a soil-moisture sensor that sends a reminder when the plants need water.");
  await page.getByLabel("Skills you actually used").fill("Python");
  await page.getByLabel("Skills you actually used").press("Enter");
  await page.getByLabel("Evidence links").fill("https://example.org/meera/plant-bot");
  await page.getByLabel("Evidence links").press("Enter");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/goals\/portfolio\/(?!new$)[a-z0-9]+$/);
  await expect(page.getByText("Draft — not in CVs")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText("Approved — can appear in CVs")).toBeVisible();

  // Save an opportunity from a pasted posting.
  await page.goto("/goals/opportunities");
  await expect(page.getByRole("link", { name: "Google Summer of Code" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Add a link" }).click();
  await page.getByLabel("Link to the posting").fill("https://example.org/jobs/embedded-intern");
  await page.getByLabel("Posting text (optional)").fill(POSTING);
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(page.getByText("Saved to your applications")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Embedded Systems Intern" })).toBeVisible();
  await expect(page.getByText("₹10,000 per month", { exact: true })).toBeVisible();

  // Fit: shown vs gap vs eligibility; a gap becomes a goal and a calendar session.
  await page.getByRole("button", { name: "Check my fit" }).click();
  await expect(page.getByText(/1 gap found/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Plant-watering reminder bot" })).toBeVisible();
  await page.getByRole("button", { name: "Make a plan" }).click();
  await expect(page).toHaveURL(/\/calendar\?date=/, { timeout: 30_000 });
  await expect(page.getByText(/Work on: Git and collaborative coding/).first()).toBeVisible();
  await page.goBack();

  // Track the application with a dated next step.
  await page.getByLabel("Status").selectOption("APPLIED");
  await page.getByLabel("Next step").fill("Email the coordinator");
  await page.getByLabel("By when").fill("2026-12-01");
  await page.getByRole("button", { name: "Update tracker" }).click();
  await expect(page.getByText("Updated — next step added to your calendar")).toBeVisible();

  // Interview practice with labelled feedback.
  await page.getByRole("link", { name: /Practise interview questions/ }).click();
  await page.getByLabel("Your answer").fill("I am a second-year B.Sc student. I built a plant-watering bot in Python because our plants kept drying out, and it now reminds us every week.");
  await page.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByText("Simulated AI · AI feedback")).toBeVisible({ timeout: 30_000 });

  // A CV tailored to the opening: only approved work, suggestions need approval.
  await page.goto("/goals/cv");
  await page.getByLabel("Name this CV").fill("Embedded internship");
  await page.getByLabel("Tailor for (optional)").selectOption({ label: "Embedded Systems Intern" });
  await page.getByRole("button", { name: /Build CV/ }).click();
  await expect(page).toHaveURL(/\/goals\/cv\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Meera Iyer" })).toBeVisible();
  await expect(page.getByText(/Not claimed — no evidence yet: “Git and collaborative coding”/)).toBeVisible();
  await page.getByRole("button", { name: "Use this line" }).first().click();
  await expect(page.getByText(/\(simulated rewording\)/).last()).toBeVisible();
  const md = await page.request.get(page.url().replace("/goals/cv/", "/api/cv/") + "/export?format=md");
  expect(md.ok()).toBe(true);
  const text = await md.text();
  expect(text).toMatch(/^# Meera Iyer/);
  expect(text).toMatch(/Evidence: https:\/\/example.org\/meera\/plant-bot/);
});
