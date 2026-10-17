"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { toast } from "sonner";
import { addMistakeAction, checkUnderstandingAction, selfAssessAction, submitAttemptAction } from "@/app/(app)/learn/topic-actions";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel } from "@/components/ui/feedback";
import { Checkbox, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { CitedMarkdown } from "./cited-markdown";
import { cn } from "@/lib/utils";

export type QuestionView = {
  id: string;
  type: string;
  prompt: string;
  options: { id: string; text: string }[];
  hints: string[];
  explanation: string | null;
  marks: number | null;
  keyPoints: string[];
  modelAnswer: string | null;
  unit: string | null;
  last: { isCorrect: boolean | null; score: number | null; feedback: string | null; feedbackBy: string | null } | null;
};

type Result = Awaited<ReturnType<typeof submitAttemptAction>>;

export function PracticeRunner({
  setId,
  title,
  generatedBy,
  questions,
}: {
  setId: string;
  title: string;
  generatedBy: string;
  questions: QuestionView[];
}) {
  const [checking, startCheck] = useTransition();
  const [summary, setSummary] = useState<{ answered: number; total: number; average: number; passed: boolean } | null>(null);
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {generatedBy === "STUDENT" ? <Badge>Written by you</Badge> : <AiLabel simulated={generatedBy === "MOCK"} kind="Generated practice" />}
      </div>
      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <li key={q.id}>
            <QuestionCard q={q} index={i + 1} />
          </li>
        ))}
      </ol>
      {generatedBy !== "STUDENT" ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            variant="soft"
            className="self-start"
            disabled={checking}
            onClick={() =>
              startCheck(async () => {
                const r = await checkUnderstandingAction(setId);
                if (r) setSummary(r);
              })
            }
          >
            Check my understanding
          </Button>
          {summary ? (
            <p className={cn("text-sm", summary.passed ? "text-success" : "text-muted")}>
              {summary.passed
                ? `Understanding checked — ${Math.round(summary.average * 100)}% across ${summary.answered} questions. Badge earned!`
                : summary.answered < 3
                  ? `Answer at least 3 questions first (${summary.answered} so far). You're free to move on whenever you like.`
                  : `${Math.round(summary.average * 100)}% so far — review the explanations and mistakes, then try again. You can still move on.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function QuestionCard({ q, index }: { q: QuestionView; index: number }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [selfDone, setSelfDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const multi = q.type === "MULTI_SELECT";
  const choice = ["MCQ", "MULTI_SELECT", "TRUE_FALSE"].includes(q.type);

  const submit = () =>
    startTransition(async () => {
      const r = await submitAttemptAction(q.id, choice ? { selected, hintsUsed: hints } : { text, hintsUsed: hints });
      if ("error" in r) toast.error(r.error);
      setResult(r);
    });

  const graded = result && !("error" in result) ? result : null;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-medium">
          <span className="text-muted">{index}. </span>
          {q.prompt}
        </p>
        {q.marks ? <Badge>{q.marks} marks</Badge> : null}
      </div>

      {choice ? (
        <fieldset className="flex flex-col gap-1.5" disabled={!!graded}>
          <legend className="sr-only">Options</legend>
          {q.options.map((o) => (
            <label key={o.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm", selected.includes(o.id) && "border-primary bg-primary-soft/40")}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={`q-${q.id}`}
                checked={selected.includes(o.id)}
                onChange={() => setSelected(multi ? (selected.includes(o.id) ? selected.filter((s) => s !== o.id) : [...selected, o.id]) : [o.id])}
                className="mt-0.5 accent-[var(--primary)]"
              />
              {o.text}
            </label>
          ))}
        </fieldset>
      ) : q.type === "NUMERICAL" || q.type === "FILL_BLANK" ? (
        <div className="flex items-center gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" placeholder={q.type === "NUMERICAL" ? "Your answer (number)" : "Your answer"} className="max-w-xs" disabled={!!graded} />
          {q.unit ? <span className="text-sm text-muted">{q.unit}</span> : null}
        </div>
      ) : (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Your answer"
          placeholder={q.type === "TEACH_BACK" ? "Explain it as if to a younger student…" : "Write your answer…"}
          className="min-h-28"
          disabled={!!graded}
        />
      )}

      {hints > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {q.hints.slice(0, hints).map((h, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-accent-soft-fg">
              <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden /> {h}
            </li>
          ))}
        </ul>
      ) : null}

      {!graded ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={submit} disabled={pending || (choice ? !selected.length : !text.trim())}>
            Check answer
          </Button>
          {hints < q.hints.length ? (
            <Button size="sm" variant="ghost" onClick={() => setHints(hints + 1)}>
              <Lightbulb /> {hints ? "Another hint" : "Hint"}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {graded.needsSelfAssessment && !selfDone ? (
            <SelfAssessment attemptId={graded.attemptId} keyPoints={q.keyPoints} modelAnswer={q.modelAnswer} onDone={() => setSelfDone(true)} />
          ) : (
            <p className={cn("flex items-center gap-1.5 text-sm font-medium", graded.isCorrect ? "text-success" : graded.isCorrect === false ? "text-danger" : "text-muted")}>
              {graded.isCorrect ? <CheckCircle2 className="size-4" aria-hidden /> : graded.isCorrect === false ? <XCircle className="size-4" aria-hidden /> : null}
              {graded.isCorrect ? "Correct" : graded.isCorrect === false ? `Not quite${graded.score ? ` (${Math.round(graded.score * 100)}%)` : ""}` : "Recorded"}
            </p>
          )}
          {graded.feedback ? (
            <div className="rounded-lg bg-surface-2 p-3 text-sm">
              {graded.feedbackBy === "AI" || graded.feedbackBy === "MOCK" ? <AiLabel simulated={graded.feedbackBy === "MOCK"} kind="AI feedback" className="mb-1.5" /> : null}
              <CitedMarkdown markdown={graded.feedback} />
            </div>
          ) : null}
          {q.explanation ? (
            <details className="rounded-lg border border-border p-3 text-sm" open={graded.isCorrect === false}>
              <summary className="cursor-pointer font-medium">Explanation</summary>
              <div className="mt-1.5">
                <CitedMarkdown markdown={q.explanation} />
              </div>
            </details>
          ) : null}
          {graded.isCorrect === false ? <AddToMistakes attemptId={graded.attemptId} suggestion={graded.misconceptions[0] ?? ""} /> : null}
        </div>
      )}
      {q.last && !graded ? <p className="mt-2 text-xs text-muted">Last time: {q.last.isCorrect ? "correct" : q.last.isCorrect === false ? "not quite" : "answered"}</p> : null}
    </div>
  );
}

function SelfAssessment({ attemptId, keyPoints, modelAnswer, onDone }: { attemptId: string; keyPoints: string[]; modelAnswer: string | null; onDone: () => void }) {
  const [covered, setCovered] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-info-soft p-3 text-sm">
      <p className="font-medium text-info">Mark your own answer — which key points did you cover?</p>
      {keyPoints.map((k) => (
        <Checkbox key={k} label={k} checked={covered.includes(k)} onChange={() => setCovered(covered.includes(k) ? covered.filter((c) => c !== k) : [...covered, k])} />
      ))}
      {modelAnswer ? (
        <details>
          <summary className="cursor-pointer">Model answer</summary>
          <p className="mt-1 whitespace-pre-wrap">{modelAnswer}</p>
        </details>
      ) : null}
      <Button
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await selfAssessAction(attemptId, covered);
            toast.success(`Recorded: ${Math.round(r.score * 100)}%`);
            onDone();
          })
        }
      >
        Save my marking
      </Button>
    </div>
  );
}

function AddToMistakes({ attemptId, suggestion }: { attemptId: string; suggestion: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p className="text-sm text-success">Added to your mistake library.</p>;
  if (!open)
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        Add to my mistake library
      </Button>
    );
  return (
    <ActionForm action={addMistakeAction.bind(null, attemptId)} onSuccess={() => setDone(true)} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <label className="text-sm font-medium" htmlFor={`m-${attemptId}`}>
        What went wrong, in your words?
      </label>
      <Textarea id={`m-${attemptId}`} name="whatWentWrong" defaultValue={suggestion} className="min-h-16" />
      <SubmitButton size="sm">Save to mistake library</SubmitButton>
    </ActionForm>
  );
}
