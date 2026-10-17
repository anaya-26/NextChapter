import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("protected pages redirect to sign-in, and sign-up gives access", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);

  await signUp(page, { name: "Asha Patil" });
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "Integrations & status" })).toBeVisible();
  await expect(page.getByText("Simulated").first()).toBeVisible();
  // The mock AI is always visibly labelled.
  await expect(page.getByText(/AI responses are simulated/)).toBeVisible();
});
