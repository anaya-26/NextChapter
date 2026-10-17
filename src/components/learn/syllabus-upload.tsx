"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, ImageIcon, Upload, X } from "lucide-react";
import { uploadSyllabusAction } from "@/app/(app)/learn/actions";
import { ActionForm, FormMessage } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";

const ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,image/*,application/pdf";

export function SyllabusUploadForm({ subjectId, subjectName, maxMb, aiVision }: { subjectId: string; subjectName: string; maxMb: number; aiVision: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function sync(next: File[]) {
    const tooBig = next.find((f) => f.size > maxMb * 1024 * 1024);
    setError(tooBig ? `“${tooBig.name}” is larger than ${maxMb} MB.` : null);
    setFiles(next);
    // Mirror the selection into the real file input so the form submits it.
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    sync([...files, ...Array.from(e.dataTransfer.files)]);
  }

  return (
    <ActionForm action={uploadSyllabusAction.bind(null, subjectId)} className="flex flex-col gap-5">
      <FormMessage />
      <Field label="Name" htmlFor="title" hint="Optional — e.g. “Semester 3 syllabus 2026–27”">
        <Input id="title" name="title" placeholder={`${subjectName} syllabus`} maxLength={160} />
      </Field>

      <Tabs defaultValue="upload">
        <TabsList aria-label="How to add the syllabus">
          <TabsTrigger value="upload">Upload photos or files</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" forceMount className="data-[state=inactive]:hidden">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? "border-primary bg-primary-soft/40" : "border-border-strong bg-surface-2/40"
            }`}
          >
            <Upload className="size-8 text-muted" aria-hidden />
            <div>
              <p className="font-medium">Drop files here, or choose them</p>
              <p className="text-sm text-muted">Photos or screenshots of each page, PDF, Word (.docx) or text — up to {maxMb} MB each. Add several pages at once.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              name="files"
              multiple
              accept={ACCEPT}
              className="sr-only"
              aria-label="Syllabus files"
              onChange={(e) => sync([...files, ...Array.from(e.target.files ?? [])].filter((f, i, a) => a.findIndex((x) => x.name === f.name && x.size === f.size) === i))}
            />
          </div>
          {files.length ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  {f.type.startsWith("image/") ? <ImageIcon className="size-4 text-muted" aria-hidden /> : <FileText className="size-4 text-muted" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" onClick={() => sync(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="cursor-pointer rounded p-0.5 hover:bg-surface-3">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
          <p className="mt-3 text-xs text-muted">
            {aiVision
              ? "Photos and scanned PDFs are read by AI; anything unclear is highlighted for you to check."
              : "Photos are read with on-device text recognition (no AI configured). Clear, flat, well-lit photos work best; you'll check everything before it's saved."}
          </p>
        </TabsContent>
        <TabsContent value="paste" forceMount className="data-[state=inactive]:hidden">
          <Field label="Syllabus text" htmlFor="pastedText" hint="Copy from your university website, a PDF or a message.">
            <Textarea id="pastedText" name="pastedText" className="min-h-56 font-mono text-[13px]" placeholder={"Unit I: …\nTopic 1; Topic 2; …"} />
          </Field>
        </TabsContent>
      </Tabs>

      <Field label="Language of the syllabus" htmlFor="language" hint="Helps text recognition for Hindi or Marathi syllabi.">
        <Select id="language" name="language" defaultValue="en">
          <option value="en">English</option>
          <option value="hi">Hindi (with English terms)</option>
          <option value="mr">Marathi (with English terms)</option>
          <option value="mixed">Mixed</option>
        </Select>
      </Field>

      <div>
        <SubmitButton size="lg" pendingLabel="Uploading…" disabled={!!error}>
          Read my syllabus
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
