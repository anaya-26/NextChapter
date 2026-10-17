import "server-only";
import { registerMockResponder } from "../mock-responders";
import type { TextRequest } from "../types";

const topicFrom = (task: string) => /Topic:\s*([^.\n]+)/.exec(task)?.[1]?.trim() ?? "this topic";

/** Simulated general-knowledge lesson (used when no materials match). */
registerMockResponder("lesson_text", (req) => {
  const text = (req as unknown as TextRequest).messages.map((m) => m.content).join("\n");
  const topic = topicFrom(text);
  return `This is a simulated lesson for testing — not based on your materials.\n\n## Core idea\n${topic} is explained here in a few simple steps.\n\n## Worked example\nStep 1: identify what is given. Step 2: apply the relationship $a = b \\times c$. Step 3: check units.\n\n## Summary\nRemember the definition, one example and one common mistake for ${topic}.\n\n## Check yourself\n1. Define ${topic} in one sentence.\n2. Give one example.\n3. Name one common mistake.`;
});

registerMockResponder("practice_generate", (req) => {
  const topic = topicFrom(req.task);
  const base = { options: [], correctOptionIds: [], numericAnswer: null, tolerance: null, unit: null, acceptableAnswers: [], keyPoints: [], modelAnswer: null, marks: null, sourcePassageIds: [] as string[] };
  const questions = [
    {
      ...base,
      type: "MCQ",
      prompt: `(Simulated) Which statement about ${topic} is correct?`,
      options: [
        { id: "a", text: `The correct statement about ${topic}` },
        { id: "b", text: "A common misconception" },
        { id: "c", text: "An unrelated statement" },
        { id: "d", text: "A partly true statement" },
      ],
      correctOptionIds: ["a"],
      explanation: "Option a is the accurate statement; b is the misconception students often hold.",
      hints: ["Eliminate the unrelated option first.", "Which option matches the definition?"],
      difficulty: "INTRO",
    },
    {
      ...base,
      type: "TRUE_FALSE",
      prompt: `(Simulated) True or false: ${topic} has no exceptions.`,
      options: [
        { id: "t", text: "True" },
        { id: "f", text: "False" },
      ],
      correctOptionIds: ["f"],
      explanation: "Most rules have conditions under which they apply.",
      hints: ["Think about the conditions the rule assumes."],
      difficulty: "INTRO",
    },
    {
      ...base,
      type: "NUMERICAL",
      prompt: `(Simulated) A quantity in ${topic} is 3 units multiplied by 4 units. What is the result?`,
      numericAnswer: 12,
      tolerance: 0.1,
      unit: "units",
      explanation: "3 × 4 = 12.",
      hints: ["Identify the two given values.", "Multiply them."],
      difficulty: "STANDARD",
    },
    {
      ...base,
      type: "SHORT_ANSWER",
      prompt: `(Simulated) Explain ${topic} in two sentences.`,
      keyPoints: ["definition", "example"],
      modelAnswer: `${topic} is defined as … For example, …`,
      explanation: "A good answer gives a definition and an example.",
      hints: ["Start with a definition."],
      difficulty: "STANDARD",
      marks: 2,
    },
  ];
  return { title: `${topic} — simulated practice`, questions };
});

registerMockResponder("answer_feedback", (req) => {
  const answer = (req.references ?? []).find((r) => r.id === "student-answer")?.text.toLowerCase() ?? "";
  const keyPoints = (/Key points:\s*([^\n]*)/.exec(req.task)?.[1] ?? "").split(";").map((k) => k.trim()).filter(Boolean);
  const covered = keyPoints.filter((k) => answer.includes(k.toLowerCase().split(" ")[0]));
  const score = keyPoints.length ? covered.length / keyPoints.length : answer.length > 20 ? 0.7 : 0.3;
  return {
    score,
    verdict: score >= 0.8 ? "CORRECT" : score >= 0.4 ? "PARTLY_CORRECT" : "INCORRECT",
    coveredPoints: covered,
    missingPoints: keyPoints.filter((k) => !covered.includes(k)),
    misconceptions: score < 0.4 ? ["(Simulated) The answer misses the definition."] : [],
    feedback: "(Simulated AI feedback) Your answer was compared with the key points.",
    nextStep: "Re-read the summary and try again.",
  };
});

registerMockResponder("flashcards_generate", (req) => {
  const text = (req.references ?? []).map((r) => r.text).join(" ");
  const sentences = text
    .replace(/^>.*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/[#*>]/g, "").trim())
    .filter((s) => s.length > 20)
    .slice(0, 6);
  return { cards: sentences.map((s) => ({ front: `(Simulated) Recall: ${s.split(" ").slice(0, 6).join(" ")}…?`, back: s })) };
});

/** Simulated web search: returns provider search pages only (always valid links). */
registerMockResponder("resource_search_web", (req) => {
  const q = /learning "([^"]+)"/.exec(req.task)?.[1] ?? "study";
  return [
    { url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`, title: `Wikipedia search: ${q}`, citedText: "Simulated search result" },
    { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, title: `YouTube search: ${q}`, citedText: "Simulated search result" },
  ];
});

registerMockResponder("resource_search", (req) => ({
  resources: (req.references ?? []).map((r) => ({
    url: /URL:\s*(\S+)/.exec(r.text)?.[1] ?? "",
    title: r.title,
    provider: r.title.split(":")[0],
    type: r.title.startsWith("YouTube") ? "VIDEO" : "READING",
    difficulty: "STANDARD",
    cost: "FREE",
    relevance: "(Simulated) A starting point for this topic.",
    legitimate: true,
  })),
}));
