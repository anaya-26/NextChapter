import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("chat with the companion, act on a suggestion, and get a discovery review from demo history", async ({ page }) => {
  test.setTimeout(150_000);
  await signUp(page, { name: "Imran Khan" });

  // Companion: a starter opens a conversation and streams a (simulated) reply with actions.
  await page.goto("/companion");
  await page.getByRole("button", { name: /Plan my week/ }).click();
  await expect(page).toHaveURL(/\/companion\/[a-z0-9]+$/);
  await expect(page.getByText("Simulated AI · AI companion")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/A plan that fits around your classes/)).toBeVisible();
  await page.getByRole("button", { name: "Book 45 minutes tomorrow at 7 pm" }).click();
  await expect(page.getByText("Added to your calendar")).toBeVisible();
  await expect(page).toHaveURL(/\/calendar\?date=/);

  // A follow-up message in the same conversation.
  await page.goBack();
  await page.getByLabel("Message Kadam").fill("Quiz me on what I studied");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Review flashcards" })).toBeVisible({ timeout: 30_000 });

  // Career discovery from clearly labelled demonstration history.
  await page.goto("/settings/developer");
  await page.getByRole("button", { name: "Load demonstration history" }).click();
  await expect(page.getByText(/Loaded labelled demo history/)).toBeVisible({ timeout: 60_000 });
  await page.goto("/goals/career");
  await expect(page.getByText(/active days are labelled demo data/)).toBeVisible();
  await page.getByRole("button", { name: "Get my discovery review" }).click();
  await expect(page.getByText("Your review is ready")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Full discovery review", { exact: true })).toBeVisible();
  await expect(page.getByText("Simulated AI · AI review")).toBeVisible();
  await expect(page.getByText("What’s uncertain").first()).toBeVisible();
  await page.getByRole("button", { name: "Try this exploration" }).first().click();
  await expect(page.getByText(/Exploration added/)).toBeVisible();
  await page.getByLabel(/What did you notice/).first().fill("Liked it more than I expected — the hands-on part was fun.");
  await page.getByText("more interested").first().click();
  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByText(/the hands-on part was fun. \(want to explore more\)/)).toBeVisible();
});
