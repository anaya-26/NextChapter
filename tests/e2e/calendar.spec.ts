import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

function localKey(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

test("type an event, plan the week, run a focus session, and see sync status", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, { name: "Ravi Kulkarni" });

  // Natural-language quick add → reviewed draft → saved event.
  await page.goto(`/calendar?date=${localKey(1)}`);
  await page.getByLabel("Add by typing").fill("Physics revision tomorrow 7pm for 45 min");
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(page.getByText("Simulated AI · Read by AI — please check")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Physics revision");
  await expect(page.getByLabel("Length (minutes)")).toHaveValue("45");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Added to your calendar")).toBeVisible();
  await expect(page.getByRole("button", { name: /Physics revision/ }).first()).toBeVisible();

  // A deadline with a time estimate gives the planner something to schedule.
  await page.getByRole("button", { name: "Add event" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Maths assignment");
  await dialog.getByLabel("Type").selectOption("ASSIGNMENT");
  await dialog.getByLabel("Date").fill(localKey(3));
  await dialog.getByLabel("Due at").fill("23:59");
  await dialog.getByLabel(/How long will the work take/).fill("60");
  await dialog.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Added to your calendar")).toBeVisible();

  await page.getByRole("link", { name: "Plan my week" }).click();
  await expect(page.getByRole("heading", { name: "Plan my study time" })).toBeVisible();
  await expect(page.getByText(/Work on: Maths assignment/).first()).toBeVisible();
  await page.getByRole("button", { name: /Add \d+ sessions to my calendar/ }).click();
  await expect(page.getByText(/study sessions added to your calendar/)).toBeVisible();
  await expect(page).toHaveURL(/\/calendar$/);

  // Quick focus from Today → timer → log the session.
  await page.goto("/today");
  await expect(page.getByText("Up next")).toBeVisible();
  await page.getByRole("button", { name: "25 minutes" }).click();
  await expect(page).toHaveURL(/\/study\//);
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByLabel("Minutes you actually studied").fill("20");
  await page.getByLabel("What went well? (optional)").fill("Finished the first two problems");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByText("20 minutes logged")).toBeVisible();
  await expect(page.getByText("+4 XP for focused study")).toBeVisible();

  // Restart and Google pages explain themselves honestly.
  await page.goto("/calendar/restart");
  await expect(page.getByRole("button", { name: "Choose" }).first()).toBeVisible();
  await page.goto("/calendar/sync");
  await expect(page.getByText("Not set up on this server")).toBeVisible();
  await expect(page.getByText(/can’t read your other events’ titles/)).toBeVisible();
});
