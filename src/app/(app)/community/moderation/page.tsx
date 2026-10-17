import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { communityAccess } from "@/server/services/community";
import { FLAG_REASONS, moderationQueue } from "@/server/services/moderation";
import { ModerationButtons } from "@/components/community/community-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Moderation" };

const REASON = Object.fromEntries(FLAG_REASONS.map((r) => [r.value, r.label]));

export default async function ModerationPage() {
  const user = await requireUser();
  const at = await now(user.id);
  const access = await communityAccess(user.id, at);
  if (!access.isModerator) redirect("/community");
  const [queue, profile] = await Promise.all([moderationQueue(user.id), getProfile(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Moderation queue" description="Possible distress first, then oldest. Reported content stays hidden after enough reports until you decide." />
      {queue.length ? (
        <div className="flex flex-col gap-3">
          {queue.map((q) => (
            <Card key={q.key} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {q.reasons.map((r) => (
                  <Badge key={r} tone={r === "SELF_HARM" ? "danger" : "warning"}>
                    {REASON[r]}
                  </Badge>
                ))}
                <span className="text-xs text-muted">
                  {q.count} report{q.count === 1 ? "" : "s"} · first {q.firstAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: profile.timezone })} · {q.content!.where} · status {q.content!.status}
                </span>
              </div>
              <div>
                <p className="font-medium">{q.content!.title}</p>
                <p className="text-xs text-muted">by {q.content!.handle}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{q.content!.body}</p>
                {q.details.length ? <p className="mt-1 text-xs text-muted">Notes: {q.details.join(" · ")}</p> : null}
                {q.content!.link ? (
                  <Link href={q.content!.link} className="text-xs text-primary hover:underline">
                    Open in context
                  </Link>
                ) : null}
              </div>
              {q.reasons.includes("SELF_HARM") ? <p className="rounded-lg bg-danger-soft p-2 text-xs text-danger">The author has been sent support details. If there’s an immediate risk, follow your escalation procedure (emergency 112).</p> : null}
              <ModerationButtons targetType={q.targetType} targetId={q.targetId} />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing to review" description="Reports will appear here." />
      )}
    </div>
  );
}
