"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Info, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { acceptSuggestionAction } from "@/app/(app)/journal/actions";
import { deleteConversationAction, updateCoachingAction } from "@/app/(app)/companion/actions";
import { ActionForm } from "@/components/forms/action-form";
import { DICTATION_NOTE, DictateButton } from "@/components/forms/dictate";
import { ToneSlider } from "@/components/forms/inputs";
import { CitedMarkdown, ListenButton } from "@/components/learn/cited-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiLabel } from "@/components/ui/feedback";
import { Field, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { markdownToSpeech } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  used: string[];
  generatedBy: string | null;
  actions: { id: string; label: string }[];
  pending?: boolean;
};

function ActionButtons({ actions }: { actions: { id: string; label: string }[] }) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [pending, start] = useTransition();
  if (!actions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((a) =>
        done.includes(a.id) ? (
          <Badge key={a.id} tone="success">
            ✓ {a.label}
          </Badge>
        ) : (
          <Button
            key={a.id}
            size="sm"
            variant="soft"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await acceptSuggestionAction(a.id);
                if (r.error) toast.error(r.error);
                else {
                  setDone((d) => [...d, a.id]);
                  toast.success(r.message ?? "Done");
                  if (r.href) router.push(r.href);
                }
              })
            }
          >
            {a.label}
          </Button>
        ),
      )}
    </div>
  );
}

export function Chat({ conversationId, initial, starters, voiceLang, autoSend }: { conversationId: string; initial: ChatMessage[]; starters: string[]; voiceLang: string; autoSend: string | null }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const sentAuto = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setDraft("");
    const tempId = `pending-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `${tempId}-u`, role: "USER", content, used: [], generatedBy: null, actions: [] },
      { id: tempId, role: "ASSISTANT", content: "", used: [], generatedBy: null, actions: [], pending: true },
    ]);
    try {
      const res = await fetch(`/api/companion/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; messageId?: string; used?: string[]; actions?: { id: string; label: string }[]; generatedBy?: string; message?: string };
          setMessages((m) =>
            m.map((x) => {
              if (x.id !== tempId) return x;
              if (ev.type === "delta") return { ...x, content: x.content + (ev.text ?? "") };
              if (ev.type === "done") return { ...x, id: ev.messageId!, content: ev.text ?? x.content, used: ev.used ?? [], actions: ev.actions ?? [], generatedBy: ev.generatedBy ?? null, pending: false };
              if (ev.type === "error") return { ...x, content: ev.message ?? "Something went wrong", pending: false, generatedBy: "RULES" };
              return x;
            }),
          );
        }
      }
      router.refresh();
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, content: e instanceof Error ? e.message : "Couldn't send", pending: false, generatedBy: "RULES" } : x)));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoSend && !sentAuto.current) {
      sentAuto.current = true;
      router.replace(`/companion/${conversationId}`, { scroll: false });
      void send(autoSend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send once on arrival
  }, [autoSend]);

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex flex-1 flex-col gap-4 pb-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => send(s)} disabled={busy}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "USER" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-fg">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm">
              {m.content ? <CitedMarkdown markdown={m.content} /> : <span className="inline-flex gap-1 text-muted">Thinking…</span>}
              {!m.pending ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {m.generatedBy === "AI" || m.generatedBy === "MOCK" ? <AiLabel simulated={m.generatedBy === "MOCK"} kind="AI companion" /> : <Badge>Not AI</Badge>}
                  {m.used.length ? (
                    <span className="inline-flex items-center gap-1" title="Only data categories you allow in Privacy settings are used">
                      <Info className="size-3.5" aria-hidden /> Used: {m.used.join(", ")}
                    </span>
                  ) : m.generatedBy === "AI" || m.generatedBy === "MOCK" ? (
                    <span>Used: only this conversation</span>
                  ) : null}
                  {m.content ? <ListenButton text={markdownToSpeech(m.content)} lang={voiceLang} compact /> : null}
                </div>
              ) : null}
              <ActionButtons actions={m.actions} />
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        className="sticky bottom-20 flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="companion-input" className="sr-only">
          Message Kadam
        </label>
        <Textarea
          id="companion-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask Kadam anything…"
          className="min-h-11 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
          rows={1}
          maxLength={4000}
        />
        <DictateButton lang={voiceLang} onText={(t) => setDraft((d) => `${d}${d ? " " : ""}${t}`)} />
        <Button type="submit" size="icon-sm" disabled={busy || !draft.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
      <p className="mt-1 text-center text-[11px] text-muted">{DICTATION_NOTE}</p>
    </div>
  );
}

export function DeleteConversation({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this conversation? Memories it created stay in Settings → Memory, where you can delete them.")) start(() => deleteConversationAction(id));
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export function CoachingSettings({ tone, intensity, reminders }: { tone: number; intensity: string; reminders: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings2 /> Voice & reminders
      </Button>
      {open ? (
        <DialogContent title="How Kadam talks to you" description="Change these any time.">
          <ActionForm action={updateCoachingAction} onSuccess={() => setOpen(false)} className="flex flex-col gap-4">
            <ToneSlider name="companionTone" defaultValue={tone} />
            <Field label="How hard should Kadam push?" htmlFor="intensity">
              <Select id="intensity" name="coachingIntensity" defaultValue={intensity}>
                <option value="GENTLE">Gently — one small step at a time</option>
                <option value="BALANCED">Balanced</option>
                <option value="FIRM">Firmly — hold me to my plans</option>
              </Select>
            </Field>
            <Field label="Reminders" htmlFor="reminders">
              <Select id="reminders" name="reminderFrequency" defaultValue={reminders}>
                <option value="OFF">Off</option>
                <option value="MINIMAL">Only exams and deadlines</option>
                <option value="NORMAL">Normal</option>
                <option value="FREQUENT">Frequent</option>
              </Select>
            </Field>
            <SubmitButton className="self-start">Save</SubmitButton>
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
