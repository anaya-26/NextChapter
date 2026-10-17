import Link from "next/link";
import { BookOpen, Download, ExternalLink, FileText, Layers, Search, ShieldCheck } from "lucide-react";
import type { CoverageStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AiStatus } from "@/server/ai";
import { env } from "@/server/env";
import type { getProfile } from "@/server/services/profile";
import { LESSON_MODES, latestLessons, type LessonCitation, type LessonContent } from "@/server/services/lessons";
import { passagesForTopic } from "@/server/services/sources";
import { listNotes } from "@/server/services/notes";
import { practiceSetsForTopic, type QuestionAnswer } from "@/server/services/practice";
import { isStale } from "@/server/services/flashcards";
import { preferredStartTime, revisionsForTopic } from "@/server/services/revision";
import { directoryFor } from "@/server/services/resources";
import { addDaysToKey, formatInTz, localDateKey } from "@/lib/time";
import { hostOf, markdownToSpeech, truncate } from "@/lib/utils";
import { CitedMarkdown, ListenButton } from "@/components/learn/cited-markdown";
import { locationLabel, sourceHref } from "@/lib/citations";
import { JobProgress } from "@/components/learn/job-progress";
import { MaterialUploader } from "@/components/learn/material-uploader";
import { PracticeRunner, type QuestionView } from "@/components/learn/practice-runner";
import {
  AddResourceForm,
  AutoRequestLesson,
  CardForm,
  CompleteRevision,
  DeleteCard,
  DraftNoteButton,
  FindResourcesButton,
  NoteCard,
  NoteEditor,
  OwnQuestionForm,
  PracticeGenerator,
  RequestLessonButton,
  ResourceFlags,
  ScheduleRevisionForm,
  type NoteView,
} from "@/components/learn/workspace-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AiLabel, Notice, SectionTitle } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export type TopicContext = {
  userId: string;
  topic: Prisma.TopicGetPayload<{ include: { syllabus: { include: { subject: true } } } }>;
  subjectId: string;
  profile: Awaited<ReturnType<typeof getProfile>>;
  at: Date;
  ai: AiStatus;
  mode: "SIMPLE" | "STANDARD" | "DEEP" | "EXAM";
};

const tz = (ctx: TopicContext) => ctx.profile.timezone;
const when = (ctx: TopicContext, d: Date) => formatInTz(d, tz(ctx), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function CoverageBadge({ coverage }: { coverage: CoverageStatus }) {
  const map: Record<CoverageStatus, { tone: "success" | "warning" | "danger" | "neutral"; label: string; title: string }> = {
    COVERED: { tone: "success", label: "Covered by your materials", title: "Your uploads discuss this topic in some depth (keyword estimate)" },
    PARTIAL: { tone: "warning", label: "Partly covered", title: "Your uploads mention this topic briefly or partly (keyword estimate)" },
    MISSING: { tone: "danger", label: "Not in your materials", title: "None of your uploads seem to cover this topic — see Resources" },
    UNKNOWN: { tone: "neutral", label: "No materials yet", title: "Upload notes or textbooks to compare them with the syllabus" },
  };
  const m = map[coverage];
  return (
    <Badge tone={m.tone} title={m.title}>
      {m.label}
    </Badge>
  );
}

function SourceLink({ c }: { c: { sourceId: string; sourceTitle: string; page: number | null; startSec: number | null; endSec: number | null } }) {
  const loc = locationLabel(c);
  return (
    <Link href={sourceHref(c)} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
      <FileText className="size-3.5" aria-hidden /> {c.sourceTitle}
      {loc ? <span className="text-muted">· {loc}</span> : null}
    </Link>
  );
}

/* ── Learn ────────────────────────────────────────────────────────── */

export async function LearnPanel({ ctx }: { ctx: TopicContext }) {
  const { topic, mode, ai } = ctx;
  const lessons = await latestLessons(ctx.userId, topic.id);
  const lesson = lessons.get(mode) ?? null;
  const job = await prisma.job.findFirst({
    where: { userId: ctx.userId, type: "lesson.generate", AND: [{ payload: { path: ["topicId"], equals: topic.id } }, { payload: { path: ["mode"], equals: mode } }] },
    orderBy: { createdAt: "desc" },
  });
  const running = job && (job.status === "QUEUED" || job.status === "RUNNING");
  const failed = job && job.status === "FAILED" && (!lesson || job.createdAt > lesson.createdAt);
  const modeInfo = LESSON_MODES.find((m) => m.value === mode)!;
  const base = `/learn/${ctx.subjectId}/topics/${topic.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Explanation style" className="flex flex-wrap gap-1.5">
        {LESSON_MODES.map((m) => (
          <Link
            key={m.value}
            href={m.value === "STANDARD" ? base : `${base}?mode=${m.value}`}
            scroll={false}
            aria-current={m.value === mode ? "true" : undefined}
            title={m.description}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              m.value === mode ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border hover:bg-surface-2",
              lessons.has(m.value) && m.value !== mode && "font-medium",
            )}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {lesson ? (
        <LessonView ctx={ctx} lesson={lesson} running={!!running} />
      ) : running ? (
        <Card className="p-5">
          <JobProgress jobId={job.id} label={`Writing the ${modeInfo.label.toLowerCase()} explanation`} />
        </Card>
      ) : failed ? (
        <Notice tone="danger" title="The lesson couldn't be written" action={<RequestLessonButton topicId={topic.id} mode={mode} label="Try again" />}>
          {job.lastError ?? "Something went wrong."}
        </Notice>
      ) : ai.configured ? (
        mode === "STANDARD" && lessons.size === 0 ? (
          <Card className="p-5">
            <AutoRequestLesson topicId={topic.id} />
          </Card>
        ) : (
          <Card className="flex flex-col items-start gap-3 p-5">
            <p className="text-sm text-muted">{modeInfo.description}.</p>
            <RequestLessonButton topicId={topic.id} mode={mode} label={`Write the ${modeInfo.label.toLowerCase()} explanation`} />
          </Card>
        )
      ) : (
        <Notice
          tone="neutral"
          title="AI explanations aren't set up on this server"
          action={
            <Link href="/settings/integrations" className="text-sm font-medium underline">
              See what’s needed
            </Link>
          }
        >
          You can still study from your own materials (below), write notes, make flashcards, write your own practice questions, schedule revision and use the trusted resource directory.
        </Notice>
      )}

      {!lesson ? <MaterialsSay ctx={ctx} /> : null}
    </div>
  );
}

async function LessonView({ ctx, lesson, running }: { ctx: TopicContext; lesson: Awaited<ReturnType<typeof latestLessons>> extends Map<unknown, infer L> ? L : never; running: boolean }) {
  const content = lesson.content as LessonContent;
  const citations = (lesson.citations as LessonCitation[] | null) ?? [];
  const base = `/learn/${ctx.subjectId}/topics/${ctx.topic.id}`;
  const grounded = {
    GROUNDED: { tone: "success" as const, label: "Based on your materials" },
    PARTIAL: { tone: "warning" as const, label: "Partly based on your materials" },
    GENERAL_KNOWLEDGE: { tone: "warning" as const, label: "General knowledge — not from your materials" },
  }[lesson.groundedness];
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <AiLabel simulated={lesson.generatedBy === "MOCK"} kind="AI explanation" />
          <Badge tone={grounded.tone}>{grounded.label}</Badge>
          <span className="text-xs text-muted">Written {when(ctx, lesson.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListenButton text={markdownToSpeech(content.markdown)} lang={lesson.language} />
          {running ? <Badge tone="info">Rewriting…</Badge> : <RequestLessonButton topicId={ctx.topic.id} mode={lesson.mode} label="Rewrite" />}
        </div>
      </div>
      {lesson.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}
      <CitedMarkdown markdown={content.markdown} citations={citations} />
      {citations.length ? (
        <section aria-labelledby="sources-used" className="border-t border-border pt-3">
          <h2 id="sources-used" className="mb-2 text-sm font-semibold">
            Sources used
          </h2>
          <ol className="flex flex-col gap-1.5 text-sm">
            {citations.map((c) => (
              <li key={c.n} id={`cite-${c.n}`} className="flex gap-2">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted">[{c.n}]</span>
                <SourceLink c={c} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Link href={`${base}?tab=practice`} className={buttonVariants({ size: "sm" })}>
          Practise this topic
        </Link>
        <Link href={`${base}?tab=notes`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          Make notes
        </Link>
      </div>
    </Card>
  );
}

async function MaterialsSay({ ctx }: { ctx: TopicContext }) {
  const passages = await passagesForTopic(ctx.userId, ctx.topic.id, 5);
  const base = `/learn/${ctx.subjectId}/topics/${ctx.topic.id}`;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle>What your materials say</SectionTitle>
      {passages.length ? (
        <ul className="flex flex-col gap-3">
          {passages.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="whitespace-pre-line">{truncate(p.text, 500)}</p>
              <p className="mt-1.5 text-xs">
                <SourceLink c={p} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Nothing in your uploads matches this topic yet.{" "}
          <Link href={`${base}?tab=sources`} className="font-medium text-primary underline">
            Add notes or slides
          </Link>{" "}
          or{" "}
          <Link href={`${base}?tab=resources`} className="font-medium text-primary underline">
            find resources
          </Link>
          . Your syllabus alone is enough to keep going.
        </p>
      )}
    </Card>
  );
}

/* ── Sources ──────────────────────────────────────────────────────── */

export async function SourcesPanel({ ctx }: { ctx: TopicContext }) {
  const [links, passages] = await Promise.all([
    prisma.topicSource.findMany({
      where: { topicId: ctx.topic.id, source: { userId: ctx.userId } },
      include: { source: { select: { id: true, title: true, kind: true, status: true } } },
      orderBy: { score: "desc" },
    }),
    passagesForTopic(ctx.userId, ctx.topic.id, 8),
  ]);
  const e = env();
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <SectionTitle action={<Link href={`/learn/${ctx.subjectId}/materials`} className="text-sm font-medium text-primary hover:underline">All materials for this subject</Link>}>
          Materials for this topic
        </SectionTitle>
        <p className="text-sm text-muted">
          Coverage is an estimate from matching the topic’s key words — it can miss topics described in other words. Linking a file to this topic always counts.
        </p>
        {links.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {links.map((l) => (
              <li key={l.sourceId} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Link href={`/learn/sources/${l.sourceId}`} className="font-medium hover:text-primary hover:underline">
                  {l.source.title}
                </Link>
                <Badge>{l.source.kind.toLowerCase()}</Badge>
                <Badge tone={l.coverage === "COVERED" ? "success" : "warning"}>{l.coverage === "COVERED" ? "Covers it" : "Mentions it"}</Badge>
                <span className="text-xs text-muted">{l.method === "MANUAL" ? "Added for this topic" : `${l.matchedChunkIds.length} matching passage(s)`}</span>
                {l.source.status !== "READY" ? <Badge tone="info">{l.source.status.toLowerCase().replace("_", " ")}</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No materials matched yet.</p>
        )}
        <MaterialUploader subjectId={ctx.subjectId} topicId={ctx.topic.id} docMb={e.MAX_UPLOAD_MB} mediaMb={e.MAX_MEDIA_UPLOAD_MB} transcription={e.transcriptionConfigured} />
      </Card>
      {passages.length ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle>Matching passages</SectionTitle>
          <ul className="flex flex-col gap-3">
            {passages.map((p) => (
              <li key={p.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="whitespace-pre-line">{truncate(p.text, 600)}</p>
                <p className="mt-1.5 text-xs">
                  <SourceLink c={p} />
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ── Notes ────────────────────────────────────────────────────────── */

export async function NotesPanel({ ctx }: { ctx: TopicContext }) {
  const [notes, lessonCount] = await Promise.all([listNotes(ctx.userId, ctx.topic.id), prisma.lesson.count({ where: { userId: ctx.userId, topicId: ctx.topic.id } })]);
  const views: NoteView[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    origin: n.origin,
    updatedAt: n.updatedAt.toISOString(),
    cardCount: n.flashcards.length,
    staleCards: n.flashcards.filter((c) => isStale({ noteVersionAt: c.noteVersionAt, note: { contentUpdatedAt: n.contentUpdatedAt } })).length,
  }));
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <SectionTitle action={lessonCount ? <DraftNoteButton topicId={ctx.topic.id} /> : null}>New note</SectionTitle>
        <NoteEditor topicId={ctx.topic.id} />
      </Card>
      {views.map((n) => (
        <NoteCard key={n.id} topicId={ctx.topic.id} note={n} />
      ))}
    </div>
  );
}

/* ── Practice ─────────────────────────────────────────────────────── */

function toQuestionView(q: Awaited<ReturnType<typeof practiceSetsForTopic>>[number]["questions"][number]): QuestionView {
  const answer = q.answer as QuestionAnswer;
  const last = q.attempts[0];
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: (q.options as { id: string; text: string }[] | null) ?? [],
    hints: q.hints,
    explanation: q.explanation,
    marks: q.marks,
    keyPoints: answer.keyPoints ?? [],
    modelAnswer: answer.modelAnswer ?? null,
    unit: answer.unit ?? null,
    last: last ? { isCorrect: last.isCorrect, score: last.score, feedback: last.feedback, feedbackBy: last.feedbackBy } : null,
  };
}

export async function PracticePanel({ ctx }: { ctx: TopicContext }) {
  const [sets, openMistakes] = await Promise.all([
    practiceSetsForTopic(ctx.userId, ctx.topic.id),
    prisma.mistake.count({ where: { userId: ctx.userId, topicId: ctx.topic.id, status: "OPEN" } }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <SectionTitle>Practise</SectionTitle>
        {ctx.ai.configured ? (
          <>
            <p className="text-sm text-muted">Choose a kind of practice. Questions are generated from your materials where possible and labelled as generated.</p>
            <PracticeGenerator topicId={ctx.topic.id} aiAvailable />
          </>
        ) : (
          <p className="text-sm text-muted">Generated practice needs AI, which isn’t set up on this server. Write your own questions below — answering them, flashcards and revision all work without AI.</p>
        )}
        {openMistakes ? (
          <p className="text-sm">
            You have {openMistakes} open mistake{openMistakes === 1 ? "" : "s"} in this topic —{" "}
            <Link href={`/learn/mistakes?topic=${ctx.topic.id}`} className="font-medium text-primary underline">
              review them
            </Link>
            .
          </p>
        ) : null}
      </Card>
      {sets.map((s) => (
        <PracticeRunner key={s.id} setId={s.id} title={s.title} generatedBy={s.generatedBy} questions={s.questions.map(toQuestionView)} />
      ))}
      <Card className="p-4 sm:p-5">
        <SectionTitle>Write your own question</SectionTitle>
        <p className="mb-3 text-sm text-muted">Turning a past-paper or textbook question into practice is one of the best ways to revise.</p>
        <OwnQuestionForm topicId={ctx.topic.id} />
      </Card>
    </div>
  );
}

/* ── Flashcards ───────────────────────────────────────────────────── */

const CARD_ORIGIN: Record<string, string> = { STUDENT: "Yours", AI: "AI from your note", MOCK: "Simulated AI", MISTAKE: "From a mistake" };

export async function CardsPanel({ ctx }: { ctx: TopicContext }) {
  const cards = await prisma.flashcard.findMany({
    where: { userId: ctx.userId, topicId: ctx.topic.id },
    include: { note: { select: { title: true, contentUpdatedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const due = cards.filter((c) => !c.suspended && c.due <= ctx.at).length;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <strong>{cards.length}</strong> card{cards.length === 1 ? "" : "s"} · <strong>{due}</strong> due now
          </p>
          <div className="flex flex-wrap gap-2">
            {due ? (
              <Link href={`/learn/review?topic=${ctx.topic.id}`} className={buttonVariants({ size: "sm" })}>
                <Layers /> Review {due} due
              </Link>
            ) : null}
            {cards.length ? (
              <a href={`/api/flashcards/export?topicId=${ctx.topic.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                <Download /> Export (Anki-compatible)
              </a>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted">Cards are scheduled with spaced repetition (FSRS): ones you find hard come back sooner. You can also make cards from your notes or mistakes.</p>
        <CardForm topicId={ctx.topic.id} />
      </Card>
      {cards.length ? (
        <Card className="divide-y divide-border">
          {cards.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3 sm:p-4">
              <details className="min-w-0 flex-1 text-sm">
                <summary className="cursor-pointer font-medium">{c.front}</summary>
                <div className="mt-1.5 whitespace-pre-line text-muted">{c.back}</div>
              </details>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.origin === "AI" || c.origin === "MOCK" ? <AiLabel simulated={c.origin === "MOCK"} kind={CARD_ORIGIN[c.origin]} /> : <Badge>{CARD_ORIGIN[c.origin]}</Badge>}
                <span className="text-xs text-muted">{c.due <= ctx.at ? "Due now" : `Next: ${formatInTz(c.due, tz(ctx), { day: "numeric", month: "short" })}`}</span>
                {isStale(c) ? <Badge tone="warning">Note changed since</Badge> : null}
              </div>
              <DeleteCard id={c.id} />
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

/* ── Revision ─────────────────────────────────────────────────────── */

export async function RevisePanel({ ctx }: { ctx: TopicContext }) {
  const [tasks, mistakes] = await Promise.all([
    revisionsForTopic(ctx.userId, ctx.topic.id),
    prisma.mistake.findMany({ where: { userId: ctx.userId, topicId: ctx.topic.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const scheduled = tasks.filter((t) => t.status === "SCHEDULED");
  const history = tasks.filter((t) => t.status !== "SCHEDULED").reverse();
  const tomorrow = addDaysToKey(localDateKey(ctx.at, tz(ctx)), 1);
  return (
    <div className="flex flex-col gap-4">
      {scheduled.map((t) => (
        <Card key={t.id} className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Revision · {when(ctx, t.dueAt)}
              {t.dueAt <= ctx.at ? (
                <Badge tone="accent" className="ml-2">
                  Due
                </Badge>
              ) : null}
            </p>
            <span className="text-xs text-muted">Interval {t.intervalDays} day{t.intervalDays === 1 ? "" : "s"}</span>
          </div>
          <p className="text-sm text-muted">Try recalling the key ideas before looking: answer a few practice questions, review flashcards, or explain it aloud.</p>
          <CompleteRevision taskId={t.id} />
        </Card>
      ))}
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <SectionTitle>Schedule a revision</SectionTitle>
        <p className="text-sm text-muted">It’s added to your Kadam calendar. After each revision, the next one is spaced out according to how much you remembered.</p>
        <ScheduleRevisionForm topicId={ctx.topic.id} defaultDate={tomorrow} defaultTime={preferredStartTime(ctx.profile.preferredStudyTimes)} />
      </Card>
      {mistakes.length ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle action={<Link href={`/learn/mistakes?topic=${ctx.topic.id}`} className="text-sm font-medium text-primary hover:underline">Mistake library</Link>}>Mistakes to revisit</SectionTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {mistakes.map((m) => (
              <li key={m.id} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="font-medium">{m.title}</p>
                <p className="text-muted">{m.whatWentWrong}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {history.length ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle>Revision history</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2">
                <span>{when(ctx, t.completedAt ?? t.dueAt)}</span>
                <span className="text-muted">
                  {t.status === "DONE" ? (t.recallScore != null ? `Recalled ${Math.round(t.recallScore * 100)}%` : "Done") : t.status === "SKIPPED" ? "Skipped" : "Missed"}
                  {t.isDemo ? " · demo" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ── Resources ────────────────────────────────────────────────────── */

const COST: Record<string, string> = { FREE: "Free", FREEMIUM: "Free + paid parts", PAID: "Paid", UNKNOWN: "Cost unknown" };
const DIFFICULTY: Record<string, string> = { INTRO: "Introductory", STANDARD: "Standard", ADVANCED: "Advanced" };

export async function ResourcesPanel({ ctx }: { ctx: TopicContext }) {
  const resources = await prisma.resource.findMany({
    where: { userId: ctx.userId, topicId: ctx.topic.id, dismissed: false },
    orderBy: [{ saved: "desc" }, { createdAt: "desc" }],
  });
  const directory = directoryFor(ctx.profile.educationStage, `${ctx.topic.title} ${ctx.topic.syllabus.subject.name}`);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <SectionTitle>Find resources</SectionTitle>
        {ctx.ai.webSearch ? (
          <>
            <p className="text-sm text-muted">Searches the web for free, legitimate readings, videos and open textbooks that match this topic. Only links the search actually returned are kept, and each is checked.</p>
            <FindResourcesButton topicId={ctx.topic.id} />
          </>
        ) : (
          <p className="text-sm text-muted">AI web search isn’t enabled on this server, so use the trusted directory below or save links you find.</p>
        )}
      </Card>

      {resources.length ? (
        <Card className="divide-y divide-border">
          {resources.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">
                  {r.title} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                </a>
                <p className="text-xs text-muted">{r.provider ?? hostOf(r.url)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.origin === "AI_WEB_SEARCH" || r.origin === "MOCK" ? <AiLabel simulated={r.origin === "MOCK"} kind="Found by AI web search" /> : r.origin === "STUDENT" ? <Badge>Saved by you</Badge> : <Badge>Directory</Badge>}
                  <Badge tone={r.cost === "FREE" ? "success" : r.cost === "PAID" ? "warning" : "neutral"}>{COST[r.cost]}</Badge>
                  {r.difficulty ? <Badge>{DIFFICULTY[r.difficulty]}</Badge> : null}
                  <Badge>{r.type.toLowerCase().replace("_", " ")}</Badge>
                  {r.isSearchLink ? <Badge tone="info">Search page, not a specific resource</Badge> : null}
                  {r.linkStatus === "UNREACHABLE" ? (
                    <Badge tone="danger">Link didn’t respond</Badge>
                  ) : r.linkStatus === "REACHABLE" && r.linkCheckedAt ? (
                    <Badge tone="success">
                      <ShieldCheck /> Link checked {formatInTz(r.linkCheckedAt, tz(ctx), { day: "numeric", month: "short" })}
                    </Badge>
                  ) : (
                    <Badge>Link not checked yet</Badge>
                  )}
                </div>
                {r.relevance ? <p className="mt-1.5 text-sm text-muted">{r.relevance}</p> : null}
              </div>
              <ResourceFlags id={r.id} saved={r.saved} />
            </div>
          ))}
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5">
        <SectionTitle>Trusted free sources</SectionTitle>
        <p className="mb-3 text-sm text-muted">Each link opens a search for this topic on an official or open-education site.</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {directory.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noreferrer noopener" className="flex h-full flex-col gap-0.5 rounded-lg border border-border p-3 text-sm hover:border-primary">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {d.type === "VIDEO" ? <Search className="size-4 text-primary" aria-hidden /> : <BookOpen className="size-4 text-primary" aria-hidden />}
                  {d.name}
                  <Badge className="ml-auto">{d.region}</Badge>
                </span>
                <span className="text-xs text-muted">{d.description}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle>Save a link</SectionTitle>
        <AddResourceForm topicId={ctx.topic.id} subjectId={ctx.subjectId} />
      </Card>
    </div>
  );
}
