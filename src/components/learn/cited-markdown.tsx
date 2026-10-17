"use client";

import "katex/dist/katex.min.css";
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ExternalLink, Shapes, Volume2 } from "lucide-react";
import { locationLabel, sourceHref } from "@/lib/citations";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";

const noSubscribe = () => () => {};

export type CitationView = {
  n: number;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  citedText: string;
};

function CitationChip({ citation }: { citation: CitationView | undefined; children?: ReactNode }) {
  if (!citation) return null;
  const loc = locationLabel(citation);
  return (
    <Popover>
      <PopoverTrigger
        className="mx-0.5 inline-flex h-5 min-w-5 cursor-pointer items-center justify-center rounded-md bg-primary-soft px-1 align-super text-[11px] font-semibold text-primary-soft-fg no-underline hover:brightness-95"
        aria-label={`Source ${citation.n}: ${citation.sourceTitle}${loc ? `, ${loc}` : ""}`}
      >
        {citation.n}
      </PopoverTrigger>
      <PopoverContent className="w-96 text-sm">
        <p className="font-semibold">{citation.sourceTitle}</p>
        {loc ? <p className="text-xs text-muted">{loc}</p> : null}
        <blockquote className="mt-2 max-h-48 overflow-y-auto border-l-2 border-primary pl-2.5 text-muted">“{citation.citedText}”</blockquote>
        <a href={sourceHref(citation)} className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          Open the original{loc ? ` at ${loc}` : ""} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </PopoverContent>
    </Popover>
  );
}

function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [requested, setShow] = useState(false);
  // In Lite mode, wait for the student to ask for the diagram (mermaid is a large download).
  const auto = useSyncExternalStore(noSubscribe, () => document.documentElement.dataset.lite !== "true", () => false);
  const show = auto || requested;

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.documentElement.dataset.theme === "dark" ? "dark" : "neutral" });
        const { svg } = await mermaid.render(`m${id}`, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, code, id]);

  return (
    <figure className="my-4 rounded-xl border border-border bg-surface p-3">
      {!show ? (
        <Button size="sm" variant="outline" onClick={() => setShow(true)}>
          <Shapes /> Show diagram
        </Button>
      ) : error ? (
        <pre className="text-xs">{code}</pre>
      ) : svg ? (
        <div className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-sm text-muted">Drawing diagram…</p>
      )}
      <figcaption className="mt-2 text-xs text-muted">AI-drawn diagram — check it against your textbook.</figcaption>
    </figure>
  );
}

/** Lesson markdown with maths, diagrams and [[n]] citation markers. */
export function CitedMarkdown({ markdown, citations = [] }: { markdown: string; citations?: CitationView[] }) {
  const prepared = markdown.replace(/\[\[(\d+)\]\]/g, "[$1](#cite-$1)");
  return (
    <div className="prose-study">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("#cite-")) {
              const n = Number(href.slice(6));
              return <CitationChip citation={citations.find((c) => c.n === n)} />;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          code({ className, children }) {
            if (className?.includes("language-mermaid")) return <MermaidDiagram code={String(children).trim()} />;
            return <code className={className}>{children}</code>;
          },
          pre({ children, node }) {
            // Mermaid blocks render as diagrams; everything else keeps its <pre> formatting.
            const first = node?.children[0];
            const classes = first && first.type === "element" ? first.properties?.className : undefined;
            return Array.isArray(classes) && classes.includes("language-mermaid") ? <>{children}</> : <pre>{children}</pre>;
          },
        }}
      >
        {prepared}
      </Markdown>
    </div>
  );
}

/** Reads text aloud with the device's own voice (works offline, no data sent anywhere). */
export function ListenButton({ text, lang, compact = false }: { text: string; lang: string; compact?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);
  if (!supported) return null;
  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.slice(0, 6000));
    u.lang = lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
    u.rate = 0.98;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return (
    <Button size="sm" variant={compact ? "ghost" : "outline"} className={compact ? "h-7 px-2 text-xs" : undefined} onClick={toggle} aria-pressed={speaking}>
      {compact ? <Volume2 aria-hidden /> : null}
      {compact ? (speaking ? "Stop" : "Listen") : speaking ? "Stop audio recap" : "Listen to recap"}
    </Button>
  );
}
