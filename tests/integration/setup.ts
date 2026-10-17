import "dotenv/config";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";

// Point everything at the throwaway test database and a temp storage directory
// before any application module is imported.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret-123";
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
process.env.AI_PROVIDER = "mock";
process.env.ENABLE_TEST_CLOCK = "true";
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "nextchapter-test-storage-"));
process.env.OCR_LOCAL_ENABLED = "false";

beforeAll(async () => {
  const { resetDatabase } = await import("../helpers/db");
  await resetDatabase();
});

afterAll(async () => {
  const { prisma } = await import("@/server/db");
  await prisma.$disconnect();
});
