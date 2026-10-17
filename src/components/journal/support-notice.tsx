import { HeartHandshake } from "lucide-react";
import { SUPPORT_LINES } from "@/lib/wellbeing";

/** Shown when a student's words suggest they may be struggling. Supportive, never diagnostic. */
export function SupportNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm text-fg">
      <HeartHandshake className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold">It sounds like things are heavy right now.</p>
        <p>You don’t have to handle it alone. Talking to someone you trust — a friend, family member, teacher or counsellor — can help. Free, confidential support is available any time:</p>
        <ul className="list-disc pl-5">
          {SUPPORT_LINES.map((l) => (
            <li key={l.name}>
              {l.name}: <strong>{l.contact}</strong>
            </li>
          ))}
        </ul>
        <p className="text-muted">NextChapter isn’t a counsellor and won’t analyse this entry. Your studies can wait — you matter more.</p>
      </div>
    </div>
  );
}
