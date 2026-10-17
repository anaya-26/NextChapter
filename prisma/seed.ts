/**
 * Seeds reference data (idempotent):
 *  - the official opportunity directory;
 *  - the official community groups.
 *
 * Optionally (development only) creates a demo student with clearly labelled demonstration
 * history:  SEED_DEMO_ACCOUNT=true SEED_DEMO_EMAIL=demo@example.com SEED_DEMO_PASSWORD=… npm run db:seed
 * There is no built-in default password.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/server/db";
import { ensureDirectory } from "@/server/services/opportunities";
import { ensureOfficialGroups } from "@/server/services/community";
import { bootstrapStudent } from "@/server/services/profile";
import { seedDemoHistory } from "@/server/services/demo";

async function demoAccount() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to create a demo account in production");
  const email = process.env.SEED_DEMO_EMAIL || "demo@example.com";
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set SEED_DEMO_PASSWORD (8+ characters) to create the demo account");
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const id = randomUUID();
    user = await prisma.user.create({ data: { id, name: "Demo Student", email, emailVerified: true } });
    await prisma.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) } });
    await bootstrapStudent(id, "Demo Student");
    await prisma.studentProfile.update({ where: { userId: id }, data: { educationStage: "UNDERGRADUATE", onboardingCompletedAt: new Date(), onboardingStep: 99 } });
  }
  const result = await seedDemoHistory(user.id, new Date());
  console.log(`Demo account ${email}: labelled demonstration history loaded (${result.topics} topics).`);
}

async function main() {
  await ensureDirectory();
  console.log("Opportunity directory: up to date");
  await ensureOfficialGroups();
  console.log("Official community groups: up to date");
  if (process.env.SEED_DEMO_ACCOUNT === "true") await demoAccount();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
