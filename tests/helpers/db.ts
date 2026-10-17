import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { bootstrapStudent } from "@/server/services/profile";

/** Empties every application table in the test database. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Creates a user the same way sign-up does (minus the password hash). */
export async function createTestUser(name = "Test Student") {
  const id = randomUUID();
  await prisma.user.create({
    data: { id, name, email: `${id.slice(0, 8)}@example.test`, emailVerified: true },
  });
  await bootstrapStudent(id, name);
  return { id, name };
}
