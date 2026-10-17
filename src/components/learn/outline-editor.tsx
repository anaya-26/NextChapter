"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { saveOutlineAction } from "@/app/(app)/learn/actions";
import { ActionForm, FormMessage } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Kind = "REQUIRED" | "BACKGROUND" | "OPTIONAL";
type TopicDraft = { key: string; id: string | null; title: string; kind: Kind; uncertain: boolean; excerpt: string | null };
type UnitDraft = { key: string; id: string | null; title: string; uncertain: boolean; excerpt: string | null; topics: TopicDraft[] };
type Assessment = { label: string; detail: string; excerpt: string | null; uncertain: boolean };

export type OutlineUnitInit = Omit<UnitDraft, "key" | "topics"> & { topics: Omit<TopicDraft, "key">[] };

let seq = 0;
const key = () => `k${++seq}`;

export function OutlineEditor({
  syllabusId,
  initialTitle,
  initialUnits,
  initialAssessment,
}: {
  syllabusId: string;
  initialTitle: string;
  initialUnits: OutlineUnitInit[];
  initialAssessment: Assessment[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [units, setUnits] = useState<UnitDraft[]>(() => initialUnits.map((u) => ({ ...u, key: key(), topics: u.topics.map((t) => ({ ...t, key: key() })) })));
  const [assessment, setAssessment] = useState<Assessment[]>(initialAssessment);

  const uncertainCount = units.reduce((s, u) => s + (u.uncertain ? 1 : 0) + u.topics.filter((t) => t.uncertain).length, 0) + assessment.filter((a) => a.uncertain).length;
  const topicCount = units.reduce((s, u) => s + u.topics.length, 0);

  const payload = useMemo(
    () =>
      JSON.stringify({
        title: title.trim() || "Syllabus",
        units: units.map((u) => ({
          id: u.id,
          title: u.title,
          topics: u.topics.map((t) => ({ id: t.id, title: t.title, kind: t.kind, uncertain: t.uncertain })),
        })),
        assessment: assessment.map((a) => ({ label: a.label, detail: a.detail, excerpt: a.excerpt, uncertain: a.uncertain })),
      }),
    [title, units, assessment],
  );

  const updateUnit = (k: string, patch: Partial<UnitDraft>) => setUnits((us) => us.map((u) => (u.key === k ? { ...u, ...patch } : u)));
  const updateTopic = (uk: string, tk: string, patch: Partial<TopicDraft>) =>
    setUnits((us) => us.map((u) => (u.key === uk ? { ...u, topics: u.topics.map((t) => (t.key === tk ? { ...t, ...patch } : t)) } : u)));
  const moveUnit = (i: number, d: -1 | 1) =>
    setUnits((us) => {
      const j = i + d;
      if (j < 0 || j >= us.length) return us;
      const copy = [...us];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const moveTopic = (uk: string, i: number, d: -1 | 1) =>
    setUnits((us) =>
      us.map((u) => {
        if (u.key !== uk) return u;
        const j = i + d;
        if (j < 0 || j >= u.topics.length) return u;
        const topics = [...u.topics];
        [topics[i], topics[j]] = [topics[j], topics[i]];
        return { ...u, topics };
      }),
    );
  const transferTopic = (fromKey: string, tk: string, toKey: string) =>
    setUnits((us) => {
      const topic = us.find((u) => u.key === fromKey)?.topics.find((t) => t.key === tk);
      if (!topic) return us;
      return us.map((u) =>
        u.key === fromKey ? { ...u, topics: u.topics.filter((t) => t.key !== tk) } : u.key === toKey ? { ...u, topics: [...u.topics, topic] } : u,
      );
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="sticky top-16 z-20 flex flex-col gap-3 p-4 shadow-pop sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {uncertainCount
            ? `${uncertainCount} item${uncertainCount === 1 ? " is" : "s are"} still marked to check — confirming accepts ${uncertainCount === 1 ? "it" : "them"} as written.`
            : "Everything has been checked."}
        </p>
        <div className="flex gap-2">
          <ActionForm action={saveOutlineAction.bind(null, syllabusId, "save")}>
            <input type="hidden" name="outline" value={payload} />
            <SubmitButton variant="outline" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
          </ActionForm>
          <ActionForm action={saveOutlineAction.bind(null, syllabusId, "confirm")}>
            <FormMessage className="mb-2" />
            <input type="hidden" name="outline" value={payload} />
            <SubmitButton pendingLabel="Confirming…" disabled={topicCount === 0}>
              Confirm syllabus
            </SubmitButton>
          </ActionForm>
        </div>
      </Card>
      <Card className="p-5">
        <label htmlFor="syllabus-title" className="text-sm font-medium">
          Syllabus name
        </label>
        <Input id="syllabus-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" maxLength={160} />
        <p className="mt-3 text-sm text-muted">
          {units.length} units · {topicCount} topics
          {uncertainCount ? (
            <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning">
              <AlertTriangle className="size-4" aria-hidden /> {uncertainCount} item{uncertainCount === 1 ? "" : "s"} to check
            </span>
          ) : null}
        </p>
      </Card>

      {units.map((u, ui) => (
        <Card key={u.key} className={cn("p-4 sm:p-5", u.uncertain && "border-warning/60")}>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <label className="sr-only" htmlFor={`unit-${u.key}`}>
                Unit {ui + 1} title
              </label>
              <Input
                id={`unit-${u.key}`}
                value={u.title}
                onChange={(e) => updateUnit(u.key, { title: e.target.value })}
                className={cn("font-semibold", u.uncertain && "border-warning")}
              />
              {u.uncertain ? (
                <UncertainNote excerpt={u.excerpt} onAccept={() => updateUnit(u.key, { uncertain: false })} label="unit" />
              ) : null}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Move unit up" onClick={() => moveUnit(ui, -1)} disabled={ui === 0}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Move unit down" onClick={() => moveUnit(ui, 1)} disabled={ui === units.length - 1}>
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete unit ${u.title}`}
              onClick={() => {
                if (!u.topics.length || confirm(`Delete “${u.title}” and its ${u.topics.length} topics?`)) setUnits((us) => us.filter((x) => x.key !== u.key));
              }}
            >
              <Trash2 />
            </Button>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {u.topics.map((t, ti) => (
              <li key={t.key} className={cn("rounded-xl border border-border p-2.5", t.uncertain && "border-warning/60 bg-warning-soft/30")}>
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-xs text-muted">{ti + 1}.</span>
                  <label className="sr-only" htmlFor={`topic-${t.key}`}>
                    Topic title
                  </label>
                  <Input
                    id={`topic-${t.key}`}
                    value={t.title}
                    onChange={(e) => updateTopic(u.key, t.key, { title: e.target.value })}
                    className={cn("h-9 flex-1", t.uncertain && "border-warning")}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 pl-8">
                  <Select
                    aria-label="Topic type"
                    value={t.kind}
                    onChange={(e) => updateTopic(u.key, t.key, { kind: e.target.value as Kind })}
                    className="h-8 w-auto text-xs"
                  >
                    <option value="REQUIRED">In syllabus</option>
                    <option value="BACKGROUND">Background</option>
                    <option value="OPTIONAL">Optional</option>
                  </Select>
                  {units.length > 1 ? (
                    <Select aria-label="Move to unit" value={u.key} onChange={(e) => transferTopic(u.key, t.key, e.target.value)} className="h-8 w-auto text-xs">
                      {units.map((x, xi) => (
                        <option key={x.key} value={x.key}>
                          Unit {xi + 1}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.title} up`} onClick={() => moveTopic(u.key, ti, -1)} disabled={ti === 0}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.title} down`} onClick={() => moveTopic(u.key, ti, 1)} disabled={ti === u.topics.length - 1}>
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete topic ${t.title}`}
                    onClick={() => updateUnit(u.key, { topics: u.topics.filter((x) => x.key !== t.key) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {t.uncertain ? <UncertainNote excerpt={t.excerpt} onAccept={() => updateTopic(u.key, t.key, { uncertain: false })} label="topic" /> : null}
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => updateUnit(u.key, { topics: [...u.topics, { key: key(), id: null, title: "", kind: "REQUIRED", uncertain: false, excerpt: null }] })}
          >
            <Plus /> Add topic
          </Button>
        </Card>
      ))}

      <Button
        variant="outline"
        className="self-start"
        onClick={() => setUnits((us) => [...us, { key: key(), id: null, title: `Unit ${us.length + 1}`, uncertain: false, excerpt: null, topics: [] }])}
      >
        <Plus /> Add unit
      </Button>

      <Card className="p-5">
        <h2 className="font-semibold">Assessment details</h2>
        <p className="mb-3 text-sm text-muted">Only details your syllabus actually states — marks, weightage, exam duration, practicals. Kadam never assumes an exam pattern.</p>
        <ul className="flex flex-col gap-2">
          {assessment.map((a, i) => (
            <li key={i} className={cn("flex flex-wrap items-center gap-2", a.uncertain && "rounded-lg bg-warning-soft/40 p-1.5")}>
              <Input
                aria-label="Assessment item"
                value={a.label}
                onChange={(e) => setAssessment((as) => as.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="h-9 w-56"
              />
              <Input
                aria-label="Details"
                value={a.detail}
                onChange={(e) => setAssessment((as) => as.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))}
                className="h-9 min-w-48 flex-1"
              />
              {a.uncertain ? (
                <Button size="sm" variant="soft" onClick={() => setAssessment((as) => as.map((x, j) => (j === i ? { ...x, uncertain: false } : x)))}>
                  <Check /> Looks right
                </Button>
              ) : null}
              <Button variant="ghost" size="icon-sm" aria-label="Remove assessment item" onClick={() => setAssessment((as) => as.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAssessment((as) => [...as, { label: "", detail: "", excerpt: null, uncertain: false }])}>
          <Plus /> Add stated detail
        </Button>
      </Card>

    </div>
  );
}

function UncertainNote({ excerpt, onAccept, label }: { excerpt: string | null; onAccept: () => void; label: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <Badge tone="warning">
        <AlertTriangle /> Check this {label}
      </Badge>
      {excerpt ? <span className="text-muted">Source: “{excerpt.slice(0, 140)}”</span> : null}
      <button type="button" onClick={onAccept} className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
        Looks right
      </button>
    </div>
  );
}
