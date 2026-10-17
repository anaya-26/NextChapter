import { describe, expect, it } from "vitest";
import { normaliseAnswer, numericMatches, orderingScore, parseNumeric, sameSet } from "@/lib/grading";
import { chunkCues, formatTimestamp, parseCaptions } from "@/lib/captions";
import { parseRange } from "@/lib/range";
import { markdownToSpeech } from "@/lib/utils";

describe("grading helpers", () => {
  it("parses numbers the way students write them", () => {
    expect(parseNumeric("12")).toBe(12);
    expect(parseNumeric("4,200 J")).toBe(4200);
    expect(parseNumeric("1,00,000")).toBe(100000);
    expect(parseNumeric("3.0 × 10^8 m/s")).toBe(3e8);
    expect(parseNumeric("6.6 x 10^-34")).toBeCloseTo(6.6e-34);
    expect(parseNumeric("−0.5")).toBe(-0.5);
    expect(parseNumeric("about twelve")).toBeNull();
  });

  it("compares numbers with absolute or 1% relative tolerance", () => {
    expect(numericMatches(12.05, 12, 0.1)).toBe(true);
    expect(numericMatches(12.2, 12, 0.1)).toBe(false);
    expect(numericMatches(299_000_000, 3e8)).toBe(true);
    expect(numericMatches(0, 0)).toBe(true);
  });

  it("normalises short answers and compares choices", () => {
    expect(normaliseAnswer("  Ohm’s Law. ")).toBe("ohms law");
    expect(sameSet(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameSet(["a"], ["a", "b"])).toBe(false);
    expect(orderingScore(["a", "c", "b"], ["a", "b", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("captions", () => {
  it("parses WebVTT and SRT into timed cues and groups them into passages", () => {
    const vtt = parseCaptions("WEBVTT\n\n00:00:01.000 --> 00:00:04.500\nHello\n\n00:01:05.000 --> 00:01:09.000\n<v Teacher>World</v>\n");
    expect(vtt).toEqual([
      { start: 1, end: 4.5, text: "Hello" },
      { start: 65, end: 69, text: "World" },
    ]);
    const srt = parseCaptions("1\r\n00:00:02,000 --> 00:00:03,000\r\nNamaste\r\n");
    expect(srt[0]).toMatchObject({ start: 2, end: 3, text: "Namaste" });
    const chunks = chunkCues(vtt, 60);
    expect(chunks[0].start).toBe(1);
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("byte ranges for media seeking", () => {
  it("parses satisfiable ranges and rejects the rest", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
});

describe("read-aloud text", () => {
  it("drops markup, citation markers and diagrams", () => {
    const text = markdownToSpeech("## Ohm's law\n\nIt says $V = IR$. [[1]]\n\n```mermaid\ngraph TD; A-->B\n```\n\nSee [NCERT](https://ncert.nic.in).");
    expect(text).toBe("Ohm's law. It says V = IR. See NCERT.");
  });
});
