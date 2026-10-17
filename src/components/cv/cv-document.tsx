import type { ReactNode } from "react";
import type { CvDoc, CvEntry } from "@/server/services/cv";
import { SECTION_LABELS } from "@/lib/cv-sections";

/** A plain, single-column CV that reads well on screen, prints cleanly and parses well in applicant-tracking systems. */
export function CvDocumentView({ doc, renderEntryExtra }: { doc: CvDoc; renderEntryExtra?: (e: CvEntry) => ReactNode }) {
  const entries = (list: CvEntry[]) => (
    <div className="flex flex-col gap-3">
      {list.map((e) => (
        <div key={e.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold">
              {e.title}
              {e.organisation ? <span className="font-normal"> — {e.organisation}</span> : null}
              {e.role ? <span className="font-normal">, {e.role}</span> : null}
            </p>
            {e.dates ? <p className="text-xs text-muted print:text-black">{e.dates}</p> : null}
          </div>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {e.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {e.evidence.length ? (
            <p className="mt-0.5 text-xs text-muted print:text-black">
              Evidence:{" "}
              {e.evidence.map((u, i) => (
                <span key={u}>
                  {i ? ", " : ""}
                  <a href={u} className="underline" target="_blank" rel="noreferrer noopener">
                    {u.replace(/^https?:\/\//, "")}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
          {renderEntryExtra?.(e)}
        </div>
      ))}
    </div>
  );
  const section = (title: string, body: ReactNode) => (
    <section className="flex flex-col gap-2 break-inside-avoid-page">
      <h2 className="border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide print:border-black">{title}</h2>
      {body}
    </section>
  );
  return (
    <article className="cv-document flex flex-col gap-5 bg-white p-6 text-[15px] leading-relaxed text-neutral-900 sm:p-8 print:p-0">
      <header>
        <h1 className="text-2xl font-semibold">{doc.name}</h1>
        {doc.cv.headline ? <p className="text-sm">{doc.cv.headline}</p> : null}
        {doc.cv.contactLine ? <p className="text-sm text-neutral-600 print:text-black">{doc.cv.contactLine}</p> : null}
      </header>
      {doc.order.map((key) => {
        if (key === "summary" && doc.cv.summary) return <div key={key}>{section(SECTION_LABELS.summary, <p className="text-sm">{doc.cv.summary}</p>)}</div>;
        if (key === "education" && doc.education.length)
          return (
            <div key={key}>
              {section(
                SECTION_LABELS.education,
                <ul className="flex flex-col gap-1 text-sm">
                  {doc.education.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {e.line}
                        {e.result ? ` — ${e.result}` : ""}
                      </span>
                      {e.years ? <span className="text-xs text-neutral-600 print:text-black">{e.years}</span> : null}
                    </li>
                  ))}
                </ul>,
              )}
            </div>
          );
        if (key === "experience" && doc.experience.length) return <div key={key}>{section(SECTION_LABELS.experience, entries(doc.experience))}</div>;
        if (key === "projects" && doc.projects.length) return <div key={key}>{section(SECTION_LABELS.projects, entries(doc.projects))}</div>;
        if (key === "achievements" && doc.achievements.length) return <div key={key}>{section(SECTION_LABELS.achievements, entries(doc.achievements))}</div>;
        if (key === "skills" && doc.skills.length) return <div key={key}>{section(SECTION_LABELS.skills, <p className="text-sm">{doc.skills.join(" · ")}</p>)}</div>;
        return null;
      })}
    </article>
  );
}
