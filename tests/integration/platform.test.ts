import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { claimNextJob, enqueueJob } from "@/server/jobs/queue";
import { registerJobHandler } from "@/server/jobs/handlers";
import { runJobsUntilIdle } from "@/server/jobs/runner";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { getOwnedFile, readFileBuffer, saveFile } from "@/server/storage";
import { createTestUser } from "../helpers/db";

describe("job queue", () => {
  it("runs handlers, records progress and retries failures with backoff", async () => {
    let calls = 0;
    registerJobHandler("test.flaky", async (_payload, ctx) => {
      calls++;
      await ctx.progress(50, "halfway");
      if (calls === 1) throw new Error("transient");
      return { ok: true };
    });
    const job = await enqueueJob("test.flaky", { n: 1 });
    await runJobsUntilIdle({ types: ["test.flaky"] });
    let row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("QUEUED"); // scheduled for retry
    expect(row.lastError).toBe("transient");
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());

    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
    await runJobsUntilIdle({ types: ["test.flaky"] });
    row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("SUCCEEDED");
    expect(row.progress).toBe(100);
    expect(row.result).toEqual({ ok: true });
  });

  it("deduplicates queued work and never hands one job to two workers", async () => {
    const a = await enqueueJob("test.noop", {}, { dedupeKey: "same-work" });
    const b = await enqueueJob("test.noop", {}, { dedupeKey: "same-work" });
    expect(b.id).toBe(a.id);
    const [first, second] = await Promise.all([claimNextJob("w1", ["test.noop"]), claimNextJob("w2", ["test.noop"])]);
    expect([first?.id, second?.id].filter(Boolean)).toEqual([a.id]);
  });
});

describe("secrets and private files", () => {
  it("encrypts integration tokens with authenticated encryption", () => {
    const sealed = encryptSecret("ya29.refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(decryptSecret(sealed)).toBe("ya29.refresh-token");
    const [iv, tag, data] = sealed.split(".");
    const tampered = [iv, tag, Buffer.from("x" + data).toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("only returns stored files to their owner", async () => {
    const owner = await createTestUser("Owner");
    const other = await createTestUser("Other");
    const file = await saveFile({
      userId: owner.id,
      purpose: "SOURCE",
      fileName: "notes.txt",
      mimeType: "text/plain",
      data: Buffer.from("private notes"),
    });
    expect(await getOwnedFile(other.id, file.id)).toBeNull();
    const mine = await getOwnedFile(owner.id, file.id);
    expect(mine?.key).toBe(file.key);
    expect((await readFileBuffer(file.key)).toString()).toBe("private notes");
  });
});
