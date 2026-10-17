import { expect, test, type Browser, type Page } from "@playwright/test";
import { signUp } from "./helpers";

async function newMember(browser: Browser, name: string, handle: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, { name });
  await page.goto("/community");
  await page.getByLabel("Choose a handle").fill(handle);
  await page.getByText("I’ll follow these guidelines").click();
  await page.getByRole("button", { name: "Join the community" }).click();
  await expect(page.getByText("Welcome!")).toBeVisible();
  return page;
}

async function openGroup(page: Page, name: string) {
  await page.goto("/community/groups");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("ask, explain, mark helpful, stay safe, report, block and moderate", async ({ browser }) => {
  test.setTimeout(240_000);
  const stamp = String(Date.now()).slice(-6).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
  const asker = await newMember(browser, "Kavya Rao", `kavya_${stamp}`);
  const helper = await newMember(browser, "Rohan Das", `rohan_${stamp}`);

  // Only the handle is public; contact details are refused.
  await openGroup(asker, "JEE preparation");
  await asker.getByLabel("Title").fill("Why is work done by friction negative?");
  await asker.getByLabel("Your question — what have you tried?").fill("Call me on 98765 43210 if you know!");
  await asker.getByRole("button", { name: "Post" }).click();
  await expect(asker.getByRole("alert").filter({ hasText: /phone numbers can’t be shared/ })).toBeVisible();
  await asker.getByLabel("Your question — what have you tried?").fill("I thought work is always positive when something moves. What am I missing?");
  await asker.getByRole("button", { name: "Post" }).click();
  await expect(asker).toHaveURL(/\/community\/posts\/[a-z0-9]+$/);
  const postUrl = asker.url();
  await expect(asker.getByText(`kavya_${stamp}`).first()).toBeVisible();
  await expect(asker.getByText("Kavya Rao")).toHaveCount(0);

  // A peer explanation with attribution.
  await helper.goto(postUrl);
  await helper.getByLabel("Your explanation").fill("Friction acts opposite to the displacement, so the angle is 180° and cos 180° = −1. That makes the work negative.");
  await helper.getByRole("button", { name: "Post explanation" }).click();
  await expect(helper.getByText("Explanation posted — thank you for helping")).toBeVisible();

  // Marking it helpful rewards the helper once.
  await asker.reload();
  await expect(asker.getByText("Peer explanation")).toBeVisible();
  await asker.getByRole("button", { name: /^Helpful/ }).last().click();
  await expect(asker.getByRole("button", { name: /^Helpful · 1/ })).toHaveAttribute("aria-pressed", "true");
  await helper.goto("/notifications");
  await expect(helper.getByText("Someone found your answer helpful")).toBeVisible();
  await helper.goto("/progress");
  await expect(helper.getByText(/Your explanation on “Why is work done by friction negative\?” helped someone/)).toBeVisible();

  // Report, then block: the post disappears for the helper.
  await helper.goto(postUrl);
  await helper.getByRole("button", { name: "Report" }).first().click();
  await helper.getByLabel("Spam or advertising").check();
  await helper.getByRole("button", { name: "Send report" }).click();
  await expect(helper.getByText(/moderators will review it|hidden until a moderator/)).toBeVisible();
  helper.once("dialog", (d) => d.accept());
  await helper.getByRole("button", { name: `Block kavya_${stamp}` }).click();
  await expect(helper.getByText(/Blocked kavya_/)).toBeVisible();
  await helper.goto(postUrl);
  await expect(helper.getByRole("heading", { name: "We couldn’t find that" })).toBeVisible();

  // A moderator sees the report and decides.
  const mod = await newMember(browser, "Meena Joshi", `meena_${stamp}`);
  await mod.goto("/settings/developer");
  await mod.getByRole("button", { name: "Make me a community moderator" }).click();
  await expect(mod.getByText(/You’re a moderator \(demo\)/)).toBeVisible();
  await mod.goto("/community/moderation");
  const item = mod.locator("div", { hasText: "Why is work done by friction negative?" }).filter({ has: mod.getByRole("button", { name: "Keep visible" }) }).last();
  await expect(item.getByText("Spam or advertising")).toBeVisible();
  await item.getByRole("button", { name: "Keep visible" }).click();
  await expect(mod.getByText("Decision recorded")).toBeVisible();
});
