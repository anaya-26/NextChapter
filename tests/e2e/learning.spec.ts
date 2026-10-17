import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

const syllabusText = readFileSync("tests/fixtures/sample-syllabus.txt", "utf8");
const notes = `Current electricity notes.

Ohm's law states that the current through a conductor is directly proportional to the potential difference across it, provided temperature and other physical conditions stay the same. In symbols, V = IR, where R is the resistance. A graph of V against I for an ohmic conductor is a straight line through the origin, and its slope gives the resistance. Ohm's law does not hold for diodes or for a filament lamp whose temperature changes a lot. Always check units: volts, amperes and ohms.`;

test("materials → cited lesson → practice → flashcard review → revision → resources", async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, { name: "Meera Iyer" });
  await page.goto("/learn");
  await page.getByLabel("Subject").fill("Physics");
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Syllabus text").fill(syllabusText);
  await page.getByRole("button", { name: "Read my syllabus" }).click();
  await expect(page.getByRole("heading", { name: "Check what NextChapter found" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Confirm syllabus" }).click();
  await expect(page.getByText("Syllabus confirmed — roadmap ready")).toBeVisible();
  const roadmapUrl = page.url().replace(/\?.*$/, "");

  // Upload class notes; processing runs in the background and coverage is estimated.
  await page.getByRole("link", { name: "Materials" }).click();
  await page.getByLabel("Study material files").setInputFiles({ name: "current-notes.txt", mimeType: "text/plain", buffer: Buffer.from(notes) });
  await expect(page.getByText(/Uploaded 1 file/)).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Covered", { exact: true })).toBeVisible();

  // Opening a topic prepares a lesson grounded in the notes, with citations.
  await page.goto(roadmapUrl);
  await page.getByRole("link", { name: "Ohm's law" }).first().click();
  await expect(page.getByRole("heading", { name: "Ohm's law", level: 1 })).toBeVisible();
  await expect(page.getByText("Simulated AI · AI explanation")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/based on your materials/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources used" })).toBeVisible();
  await page.getByRole("button", { name: /^Source 1: current-notes\.txt/ }).click();
  await expect(page.getByRole("link", { name: /Open the original/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Practice: generated questions are labelled; grading is immediate.
  await page.getByRole("link", { name: "Practice" }).click();
  await page.getByRole("button", { name: "Quick check" }).click();
  await expect(page.getByText("Simulated AI · Generated practice")).toBeVisible({ timeout: 30_000 });
  await page.getByText(/^The correct statement about/).first().click();
  await page.getByRole("button", { name: "Check answer" }).first().click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();

  // Flashcards: add one and review it with spaced repetition.
  await page.getByRole("link", { name: "Flashcards" }).click();
  await page.getByLabel("Front (question)").fill("State Ohm's law");
  await page.getByLabel("Back (answer)").fill("V = IR at constant temperature");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("Flashcard added")).toBeVisible();
  await page.getByRole("link", { name: /Review 1 due/ }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: "V = IR at constant temperature" })).toBeVisible();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page.getByText(/Review done — 1 card/)).toBeVisible();

  // Revision goes onto the calendar; resources are found and labelled.
  await page.goBack();
  await page.getByRole("link", { name: "Revise" }).click();
  await page.getByRole("button", { name: "Schedule revision" }).click();
  await expect(page.getByText("Revision scheduled and added to your calendar")).toBeVisible();
  await expect(page.getByText(/^Revision · /)).toBeVisible();

  await page.getByRole("link", { name: "Resources", exact: true }).click();
  await page.getByRole("button", { name: "Find resources on the web" }).click();
  await expect(page.getByText("Simulated AI · Found by AI web search").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /NCERT textbooks/ })).toBeVisible();

  await page.getByRole("button", { name: "Mark as studied" }).click();
  await expect(page.getByText("Studied").first()).toBeVisible();
});
