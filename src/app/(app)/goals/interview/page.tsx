import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { getOpportunity } from "@/server/services/opportunities";
import { interviewQuestions, parseFeedback } from "@/server/services/applications";
import { cn } from "@/lib/utils";
import { DeletePracticeButton, InterviewAnswerForm } from "@/components/opportunities/opportunity-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiLabel, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Interview practice" };

const STAR = [
  ["situation", "Situation"],
  ["task", "Task"],
  ["action", "Action"],
  ["result", "Result"],
] as const;

export default async function InterviewPage(props: PageProps<"/goals/interview">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const oppId = typeof sp.opportunity === "string" ? sp.opportunity : null;
  const opp = oppId ? await getOpportunity(user.id, oppId) : null;
  const app = opp ? await prisma.application.findFirst({ where: { userId: user.id, opportunityId: opp.id }, select: { id: true } }) : null;
  const [questions, profile, history] = await Promise.all([
    interviewQuestions(user.id, app?.id ?? null),
    getProfile(user.id),
    prisma.interviewPractice.findMany({ where: { userId: user.id, applicationId: app?.id ?? null }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const qIndex = Math.min(Math.max(Number(typeof sp.q === "string" ? sp.q : 0) || 0, 0), questions.length - 1);
  const current = questions[qIndex];
  const base = `/goals/interview?${opp ? `opportunity=${opp.id}&` : ""}q=`;

  return (
    <div className="flex flex-col gap-6">
      {opp ? (
        <Link href={`/goals/opportunities/${opp.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> {opp.title}
        </Link>
      ) : null}
      <PageHeader
        title="Interview practice"
        description={opp ? `Questions for ${opp.title} at ${opp.organisation}, drawn from the opening and your approved portfolio.` : "Common questions plus ones drawn from your approved portfolio. Practise out loud — type or dictate your answer."}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <nav aria-label="Questions">
          <ol className="flex flex-col gap-1">
            {questions.map((q, i) => (
              <li key={q.question}>
                <Link href={`${base}${i}`} aria-current={i === qIndex ? "true" : undefined} className={cn("block rounded-lg px-3 py-2 text-sm", i === qIndex ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}>
                  {q.question}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{current.question}</h2>
            <p className="text-sm text-muted">{current.why}</p>
            <InterviewAnswerForm question={current.question} applicationId={app?.id ?? null} achievementId={current.achievementId ?? null} lang={profile.preferredLanguage} />
          </Card>

          <section>
            <SectionTitle>Your practice</SectionTitle>
            {history.length ? (
              <div className="flex flex-col gap-3">
                {history.map((h) => {
                  const f = parseFeedback(h.feedback);
                  return (
                    <Card key={h.id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 font-medium">{h.question}</p>
                        <DeletePracticeButton id={h.id} />
                      </div>
                      <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-sm">{h.answer}</p>
                      {f ? (
                        <div className="flex flex-col gap-2 text-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {f.by === "AI" || f.by === "MOCK" ? <AiLabel simulated={f.by === "MOCK"} kind="AI feedback" /> : <Badge>Rule-based feedback (not AI)</Badge>}
                            {STAR.map(([k, label]) => (
                              <Badge key={k} tone={f.star[k] ? "success" : "outline"}>
                                {f.star[k] ? <Check aria-hidden /> : <Minus aria-hidden />} {label}
                              </Badge>
                            ))}
                          </div>
                          {f.strengths.length ? (
                            <div>
                              <p className="font-medium">What worked</p>
                              <ul className="list-disc pl-5 text-muted">{f.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                            </div>
                          ) : null}
                          {f.improvements.length ? (
                            <div>
                              <p className="font-medium">To improve</p>
                              <ul className="list-disc pl-5 text-muted">{f.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
                            </div>
                          ) : null}
                          {f.followUp ? <p className="text-muted">Likely follow-up: {f.followUp}</p> : null}
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-4 text-sm text-muted">Your answers and feedback will appear here. They’re private to you.</Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
