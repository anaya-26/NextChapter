import { CheckCircle2, Circle, CircleDot, Lightbulb, RefreshCcw, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AiLabel } from "@/components/ui/feedback";

export function ExtractionBadge({ method }: { method: string }) {
  switch (method) {
    case "AI":
      return <AiLabel kind="Read by AI — please check" />;
    case "MOCK":
      return <AiLabel simulated kind="extraction" />;
    case "OCR_RULES":
      return <Badge tone="info">On-device text recognition + rules</Badge>;
    case "RULES":
      return <Badge tone="info">Rule-based reading (AI not configured)</Badge>;
    default:
      return <Badge>Entered manually</Badge>;
  }
}

export function KindBadge({ kind, origin }: { kind: string; origin: string }) {
  const suggested = origin === "AI" ? "AI-suggested" : origin === "MOCK" ? "Simulated suggestion" : null;
  if (kind === "BACKGROUND")
    return (
      <Badge tone="info" title="A foundation that isn't in your syllabus but helps you understand it">
        Background{suggested ? ` · ${suggested}` : ""}
      </Badge>
    );
  if (kind === "OPTIONAL")
    return (
      <Badge tone="accent" title="Beyond the syllabus — for curiosity, not required">
        Optional{suggested ? ` · ${suggested}` : ""}
      </Badge>
    );
  return null;
}

/** Studied, Understanding checked and Revised are separate, visible states. */
export function TopicProgressMarks({
  status,
  studiedAt,
  understandingCheckedAt,
  lastRevisedAt,
  revisionCount,
}: {
  status: string;
  studiedAt: Date | null;
  understandingCheckedAt: Date | null;
  lastRevisedAt: Date | null;
  revisionCount: number;
}) {
  if (status === "SKIPPED")
    return (
      <Badge>
        <SkipForward /> Skipped — familiar
      </Badge>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {studiedAt || status === "STUDIED" ? (
        <Badge tone="primary">
          <CheckCircle2 /> Studied
        </Badge>
      ) : status === "IN_PROGRESS" ? (
        <Badge tone="info">
          <CircleDot /> Studying
        </Badge>
      ) : (
        <Badge>
          <Circle /> Not started
        </Badge>
      )}
      {understandingCheckedAt ? (
        <Badge tone="success">
          <Lightbulb /> Understanding checked
        </Badge>
      ) : null}
      {lastRevisedAt ? (
        <Badge tone="accent">
          <RefreshCcw /> Revised{revisionCount > 1 ? ` ×${revisionCount}` : ""}
        </Badge>
      ) : null}
    </span>
  );
}
