import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const syllabusText = readFileSync("tests/fixtures/sample-syllabus.txt", "utf8");
const notes = `Current electricity notes.

Ohm's law states that the current through a conductor is directly proportional to the potential difference across it, provided temperature and other physical conditions stay the same. In symbols, V = IR, where R is the resistance. A graph of V against I for an ohmic conductor is a straight line through the origin, and its slope gives the resistance.`;
const reflection =
  "Studied Ohm's law today with my own class notes. Drawing the V–I graph myself made the slope idea click, and the quick check went well. I still mix up when a conductor stops being ohmic, so I want to revise filament lamps and diodes tomorrow evening before the test.";
const posting = `Electronics Lab Intern
Company: Example Circuits Pvt Ltd
Location: Pune
Stipend: ₹8,000 per month
Apply by 20 Dec 2026

Skills required:
- Basic electronics
- Python
- Soldering`;

/**
 * The whole connected journey for one student: syllabus → roadmap → topic with traceable
 * sources → practice → revision in the calendar → a reflection the AI may read (by choice) →
 * XP counted once → an opportunity with gaps → a real achievement in a CV → a deliberate
 * community post.
 */
test("one student's journey from syllabus to a shared achievement", async ({ page }) => {
  test.setTimeout(300_000);
  await signUp(page, { name: "Aarav Kulkarni" });

  // Syllabus → roadmap.
  await page.goto("/learn");
  await page.getByLabel("Subject").fill("Physics");
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Syllabus text").fill(syllabusText);
  await page.getByRole("button", { name: "Read my syllabus" }).click();
  await expect(page.getByRole("heading", { name: "Check what Kadam found" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Confirm syllabus" }).click();
  await expect(page.getByText("Syllabus confirmed — roadmap ready")).toBeVisible();
  const roadmapUrl = page.url().replace(/\?.*$/, "");

  // Materials → a topic whose lesson cites them.
  await page.getByRole("link", { name: "Materials" }).click();
  await page.getByLabel("Study material files").setInputFiles({ name: "class-notes.txt", mimeType: "text/plain", buffer: Buffer.from(notes) });
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.goto(roadmapUrl);
  await page.getByRole("link", { name: "Ohm's law" }).first().click();
  await expect(page.getByRole("heading", { name: "Sources used" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Source 1: class-notes\.txt/ }).click();
  await expect(page.getByRole("link", { name: /Open the original/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Practice, then revision scheduled into the calendar.
  await page.getByRole("link", { name: "Practice" }).click();
  await page.getByRole("button", { name: "Quick check" }).click();
  await page.getByText(/^The correct statement about/).first().click();
  await page.getByRole("button", { name: "Check answer" }).first().click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Revise" }).click();
  await page.getByRole("button", { name: "Schedule revision" }).click();
  await expect(page.getByText("Revision scheduled and added to your calendar")).toBeVisible();

  // The student chooses to let the AI read journal entries they mark — then marks one.
  await page.goto("/settings/privacy");
  await page.getByRole("switch", { name: "Journal (entries you choose)" }).click();
  await page.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.goto("/journal");
  await page.getByLabel("How did it go?").fill(reflection);
  await page.locator("form").filter({ has: page.getByLabel("How did it go?") }).getByRole("switch", { name: "Let the AI read this entry" }).click();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page).toHaveURL(/\/journal\/[a-z0-9]+$/);
  await expect(page.getByText("AI may read this entry")).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Suggested next steps")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // A second reflection the same day doesn't earn reflection XP again.
  await page.goto("/journal");
  await page.getByLabel("How did it go?").fill(`${reflection} Also tried two extra numericals.`);
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page).toHaveURL(/\/journal\/[a-z0-9]+$/);
  await page.goto("/progress");
  await expect(page.getByRole("listitem").filter({ hasText: "Wrote a reflection" })).toHaveCount(1);

  // An opportunity with its gaps.
  await page.goto("/goals/opportunities");
  await page.getByRole("button", { name: "Add a link" }).click();
  await page.getByLabel("Link to the posting").fill("https://example.org/jobs/electronics-lab-intern");
  await page.getByLabel("Posting text (optional)").fill(posting);
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(page.getByText("Saved to your applications")).toBeVisible({ timeout: 30_000 });
  const opportunityUrl = page.url().replace(/\?.*$/, "");
  await page.getByRole("button", { name: "Check my fit" }).click();
  await expect(page.getByText(/3 gaps found/)).toBeVisible({ timeout: 30_000 });

  // A real achievement, approved with evidence, goes into a CV.
  await page.goto("/goals/portfolio/new");
  await page.getByLabel("Title").fill("Breadboard continuity tester");
  await page.getByLabel("What did you do?").fill("Built a continuity tester on a breadboard with an LED and buzzer and used it to debug our lab circuits.");
  await page.getByLabel("Skills you actually used").fill("Basic electronics");
  await page.getByLabel("Skills you actually used").press("Enter");
  await page.getByLabel("Evidence links").fill("https://example.org/aarav/continuity-tester");
  await page.getByLabel("Evidence links").press("Enter");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/goals\/portfolio\/(?!new$)[a-z0-9]+$/);
  const achievementId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText("Approved — can appear in CVs")).toBeVisible();
  await page.goto(opportunityUrl);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText(/2 gaps found/)).toBeVisible({ timeout: 30_000 });
  await page.goto("/goals/cv");
  await page.getByLabel("Name this CV").fill("Electronics internships");
  await page.getByLabel("Tailor for (optional)").selectOption({ label: "Electronics Lab Intern" });
  await page.getByRole("button", { name: /Build CV/ }).click();
  await expect(page).toHaveURL(/\/goals\/cv\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.locator("article.cv-document").getByText("Breadboard continuity tester")).toBeVisible();

  // Deliberately sharing it with the community.
  await page.goto("/community");
  await page.getByLabel("Choose a handle").fill(`circuit_${"abcdefghij".split("").sort(() => Math.random() - 0.5).join("").slice(0, 6)}`);
  await page.getByText("I’ll follow these guidelines").click();
  await page.getByRole("button", { name: "Join the community" }).click();
  await expect(page.getByText("Welcome!")).toBeVisible();
  await page.goto(`/community/new?share=achievement:${achievementId}`);
  await expect(page.getByRole("heading", { name: "Share your achievement" })).toBeVisible();
  await page.getByLabel("Group").selectOption({ label: "Coding for beginners" });
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page).toHaveURL(/\/community\/posts\/[a-z0-9]+$/);
  await expect(page.getByText("Shared from their achievement")).toBeVisible();
  await expect(page.getByText("Aarav Kulkarni")).toHaveCount(0);
});
