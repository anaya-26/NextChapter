"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, accessible charts built from HTML/SVG and design tokens (no chart library):
 * thin marks, recessive hairline grid, one hue per series, hover/focus tooltips on every
 * mark, and a table view. Units are passed as data so server components can render them.
 */

type Unit = "minutes" | "percent";

function fmt(v: number | null, unit: Unit) {
  if (v == null) return "—";
  if (unit === "percent") return `${Math.round(v * 100)}%`;
  if (v < 60) return `${Math.round(v)} min`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function niceMax(v: number, unit: Unit) {
  if (unit === "percent") return 1;
  const step = v <= 120 ? 30 : v <= 600 ? 60 : 120;
  return Math.max(step, Math.ceil(v / step) * step);
}

function TableView({ caption, rows, columns }: { caption: string; rows: (string | number)[][]; columns: string[] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted">Show as table</summary>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-1 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-3 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Columns for one measure, with an optional thin target marker (e.g. planned time). */
export function ColumnChart({
  title,
  data,
  unit,
  valueLabel,
  targetLabel,
}: {
  title: string;
  data: { label: string; value: number; target?: number | null }[];
  unit: Unit;
  valueLabel: string;
  targetLabel?: string;
}) {
  const max = niceMax(Math.max(0, ...data.map((d) => Math.max(d.value, d.target ?? 0))), unit);
  const hasTarget = data.some((d) => d.target);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {hasTarget && targetLabel ? (
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden /> {valueLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 bg-fg/60" aria-hidden /> {targetLabel}
            </span>
          </span>
        ) : null}
      </figcaption>
      <div className="relative grid grid-cols-[2.75rem_1fr] gap-2">
        <div className="relative h-40 text-[11px] text-muted">
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: `${(1 - f) * 100}%` }}>
              {fmt(max * f, unit).replace(" min", "m")}
            </span>
          ))}
        </div>
        <div className="relative h-40">
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-border" style={{ top: `${f * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d) => (
              <div
                key={d.label}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${valueLabel} ${fmt(d.value, unit)}${d.target ? `, ${targetLabel} ${fmt(d.target, unit)}` : ""}`}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                <div className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${(d.value / max) * 100}%` }} />
                {d.target ? <div className="absolute inset-x-[15%] h-0.5 bg-fg/60" style={{ bottom: `${(d.target / max) * 100}%` }} aria-hidden /> : null}
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-pop group-hover:block group-focus-visible:block">
                  <p className="font-medium">{d.label}</p>
                  <p>
                    {valueLabel}: {fmt(d.value, unit)}
                  </p>
                  {d.target ? (
                    <p className="text-muted">
                      {targetLabel}: {fmt(d.target, unit)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div />
        <div className="flex gap-[2px] text-[11px] text-muted">
          {data.map((d, i) => (
            <span key={d.label} className={cn("flex-1 truncate text-center", i % 2 === 1 && data.length > 6 && "invisible sm:visible")}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
      <TableView caption={title} columns={["Week", valueLabel, ...(hasTarget && targetLabel ? [targetLabel] : [])]} rows={data.map((d) => [d.label, fmt(d.value, unit), ...(hasTarget ? [fmt(d.target ?? 0, unit)] : [])])} />
    </figure>
  );
}

/** One series over time (0–100%), with gaps where there is no data. */
export function LineChart({ title, data, emptyText }: { title: string; data: { label: string; value: number | null; n: number }[]; emptyText: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = data.map((d, i) => ({ ...d, x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100 }));
  const withValue = points.filter((p) => p.value != null);
  if (!withValue.length) {
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">{emptyText}</p>
      </figure>
    );
  }
  // Path segments break at missing weeks.
  const segments: string[] = [];
  let current = "";
  for (const p of points) {
    if (p.value == null) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    current += `${current ? "L" : "M"}${p.x},${(1 - p.value) * 100} `;
  }
  if (current) segments.push(current);
  const last = withValue[withValue.length - 1];
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="grid grid-cols-[2.75rem_1fr] gap-2">
        <div className="relative h-40 text-[11px] text-muted">
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: `${(1 - f) * 100}%` }}>
              {Math.round(f * 100)}%
            </span>
          ))}
        </div>
        <div className="relative mr-10 h-40" onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-border" style={{ top: `${f * 100}%` }} aria-hidden />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {hover != null ? <line x1={points[hover].x} x2={points[hover].x} y1={0} y2={100} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
            {segments.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {withValue.map((p) => (
            <span
              key={p.label}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
              style={{ left: `${p.x}%`, top: `${(1 - p.value!) * 100}%` }}
              aria-hidden
            />
          ))}
          <span className="absolute translate-x-2 -translate-y-1/2 text-xs font-medium tabular-nums text-fg" style={{ left: `${last.x}%`, top: `${(1 - last.value!) * 100}%` }}>
            {Math.round(last.value! * 100)}%
          </span>
          {/* Hit targets wider than the marks: one band per week. */}
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <div
                key={p.label}
                tabIndex={0}
                role="img"
                aria-label={`${p.label}: ${p.value == null ? "no data" : `${Math.round(p.value * 100)}% from ${p.n}`}`}
                className="relative h-full flex-1 outline-none"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {hover === i ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-pop">
                    <p className="font-medium">{p.label}</p>
                    <p>{p.value == null ? "No data" : `${Math.round(p.value * 100)}% (${p.n})`}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-[3.25rem] mr-10 flex text-[11px] text-muted">
        {points.map((p, i) => (
          <span key={p.label} className={cn("flex-1 truncate text-center", i % 2 === 1 && points.length > 6 && "invisible sm:visible")}>
            {p.label}
          </span>
        ))}
      </div>
      <TableView caption={title} columns={["Week", "Value", "Based on"]} rows={data.map((d) => [d.label, d.value == null ? "—" : `${Math.round(d.value * 100)}%`, d.n])} />
    </figure>
  );
}

/** Activity calendar: one hue, light → dark by minutes studied. */
export function ActivityHeatmap({ days }: { days: { dateKey: string; minutes: number; active: boolean; future: boolean; label: string }[] }) {
  const level = (d: (typeof days)[number]) => (d.future ? -1 : d.minutes >= 90 ? 4 : d.minutes >= 45 ? 3 : d.minutes >= 15 ? 2 : d.active || d.minutes > 0 ? 1 : 0);
  const shade = ["var(--surface-2)", "color-mix(in oklab, var(--primary) 25%, var(--surface))", "color-mix(in oklab, var(--primary) 50%, var(--surface))", "color-mix(in oklab, var(--primary) 75%, var(--surface))", "var(--primary)"];
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="mr-1 grid grid-rows-7 gap-1 text-[10px] text-muted" aria-hidden>
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span key={i} className="flex h-3.5 items-center">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0].dateKey} className="grid grid-rows-7 gap-1">
            {w.map((d) => {
              const l = level(d);
              return (
                <span
                  key={d.dateKey}
                  role="img"
                  aria-label={`${d.label}: ${d.future ? "upcoming" : d.minutes ? `${d.minutes} minutes studied` : d.active ? "active" : "no study"}`}
                  title={`${d.label}: ${d.future ? "upcoming" : d.minutes ? `${d.minutes} min` : d.active ? "active" : "—"}`}
                  className={cn("size-3.5 rounded-[3px]", l === -1 && "border border-dashed border-border")}
                  style={l >= 0 ? { background: shade[l] } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="flex items-center gap-1.5 text-xs text-muted">
        Less
        {shade.map((s) => (
          <span key={s} className="size-3 rounded-[3px]" style={{ background: s }} aria-hidden />
        ))}
        More (minutes studied)
      </figcaption>
    </figure>
  );
}
