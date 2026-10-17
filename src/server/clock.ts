import "server-only";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Application clock. In development/test a student can set an explicit simulated time
 * (Settings → Developer). Simulated time keeps flowing from the moment it was set.
 * Production always uses real time.
 */
export async function now(userId?: string): Promise<Date> {
  const real = new Date();
  if (!userId || !env().testClockEnabled) return real;
  const clock = await prisma.testClock.findUnique({ where: { userId } });
  if (!clock) return real;
  return new Date(clock.simulatedNow.getTime() + (real.getTime() - clock.updatedAt.getTime()));
}

export async function getTestClock(userId: string) {
  if (!env().testClockEnabled) return null;
  const clock = await prisma.testClock.findUnique({ where: { userId } });
  if (!clock) return null;
  return { simulatedNow: await now(userId) };
}

export async function setTestClock(userId: string, simulatedNow: Date) {
  if (!env().testClockEnabled) throw new Error("The test clock is disabled (ENABLE_TEST_CLOCK).");
  await prisma.testClock.upsert({
    where: { userId },
    create: { userId, simulatedNow },
    update: { simulatedNow },
  });
}

export async function clearTestClock(userId: string) {
  await prisma.testClock.deleteMany({ where: { userId } });
}
