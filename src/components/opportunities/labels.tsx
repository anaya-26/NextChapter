import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const KIND_LABELS: Record<string, string> = {
  INTERNSHIP: "Internship",
  PROGRAMME: "Programme",
  COMPETITION: "Competition",
  SCHOLARSHIP: "Scholarship",
  RESEARCH: "Research",
  FELLOWSHIP: "Fellowship",
  HACKATHON: "Hackathon",
  JOB: "Job",
  OTHER: "Other",
};

export const MODE_LABELS: Record<string, string> = { REMOTE: "Remote", ONSITE: "On-site", HYBRID: "Hybrid", UNKNOWN: "Mode not stated" };

export const SOURCE_LABELS: Record<string, string> = { DIRECTORY: "Official directory", FEED: "Permitted feed", MANUAL: "Link you saved" };

const fmtDate = (d: Date, tz: string) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: tz });

/** What Kadam knows about the source link — never claims more than was checked. */
export function VerificationBadge({ verification, lastCheckedAt, tz }: { verification: string; lastCheckedAt: Date | null; tz: string }) {
  if (verification === "EXPIRED")
    return (
      <Badge tone="neutral">
        <Clock aria-hidden /> Closed
      </Badge>
    );
  if (verification === "LINK_BROKEN")
    return (
      <Badge tone="danger">
        <Link2Off aria-hidden /> Link not found{lastCheckedAt ? ` · ${fmtDate(lastCheckedAt, tz)}` : ""}
      </Badge>
    );
  if (verification === "SOURCE_LINKED" && lastCheckedAt)
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden /> Link checked {fmtDate(lastCheckedAt, tz)}
      </Badge>
    );
  return (
    <Badge tone="warning">
      <HelpCircle aria-hidden /> Not yet verified
    </Badge>
  );
}

export function DeadlineBadge({ deadline, deadlineText, state, tz }: { deadline: Date | null; deadlineText: string | null; state: string; tz: string }) {
  if (!deadline) return <span className="text-xs text-muted">{deadlineText ?? "Deadline not stated"}</span>;
  if (state === "CLOSED")
    return (
      <Badge tone="neutral">
        <Clock aria-hidden /> Deadline passed ({fmtDate(deadline, tz)})
      </Badge>
    );
  return (
    <Badge tone={state === "CLOSING_SOON" ? "warning" : "outline"}>
      {state === "CLOSING_SOON" ? <AlertTriangle aria-hidden /> : <Clock aria-hidden />} Apply by {fmtDate(deadline, tz)}
    </Badge>
  );
}

export function readByLabel(tags: string[]) {
  const t = tags.find((x) => x.startsWith("read-by:"))?.slice(8);
  return t === "AI" ? "AI" : t === "MOCK" ? "Simulated AI" : t === "RULES" ? "Kadam’s rule-based reader" : t === "STUDENT" ? "you" : null;
}
