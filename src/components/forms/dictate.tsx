"use client";

import { useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export const DICTATION_NOTE = "Voice input uses your browser’s speech service (in Chrome, audio goes to Google to be transcribed). Typing keeps everything within Kadam.";

/** Browser dictation into a text field. Falls back to a friendly message where unsupported. */
export function DictateButton({ lang, onText, className }: { lang: string; onText: (text: string) => void; className?: string }) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) {
      toast.error("Voice input isn’t available in this browser — please type.");
      return;
    }
    r.lang = lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };
  return (
    <Button type="button" size="icon-sm" variant="ghost" onClick={toggle} aria-label={listening ? "Stop voice input" : "Voice input"} aria-pressed={listening} className={cn(listening && "text-danger", className)}>
      {listening ? <MicOff /> : <Mic />}
    </Button>
  );
}
