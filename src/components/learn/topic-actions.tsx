"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp, BookMarked, Compass, Layers, MoreHorizontal, SkipForward, Trash2, Undo2 } from "lucide-react";
import { addTopicAction, topicAction } from "@/app/(app)/learn/actions";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select, SubmitButton } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";

export function TopicActions({ id, title, kind, skipped, canDelete }: { id: string; title: string; kind: string; skipped: boolean; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (op: Parameters<typeof topicAction>[1]) => startTransition(() => topicAction(id, op));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${title}`} disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {skipped ? (
          <DropdownMenuItem onSelect={() => run("unfamiliar")}>
            <Undo2 /> Add back to my plan
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run("familiar")}>
            <SkipForward /> I already know this — skip
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => run("up")}>
          <ArrowUp /> Study earlier
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("down")}>
          <ArrowDown /> Study later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {kind !== "REQUIRED" ? (
          <DropdownMenuItem onSelect={() => run("required")}>
            <BookMarked /> Mark as in my syllabus
          </DropdownMenuItem>
        ) : null}
        {kind !== "BACKGROUND" ? (
          <DropdownMenuItem onSelect={() => run("background")}>
            <Layers /> Mark as background
          </DropdownMenuItem>
        ) : null}
        {kind !== "OPTIONAL" ? (
          <DropdownMenuItem onSelect={() => run("optional")}>
            <Compass /> Mark as optional
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={() => run("delete")}>
              <Trash2 /> Remove from roadmap
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddTopicForm({ syllabusId, units }: { syllabusId: string; units: { id: string; title: string }[] }) {
  return (
    <ActionForm action={addTopicAction.bind(null, syllabusId)} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Input name="title" aria-label="Topic to add" placeholder="e.g. Vectors refresher" maxLength={200} />
        <FieldError name="title" />
      </div>
      <Select name="kind" aria-label="Kind of topic" defaultValue="BACKGROUND" className="sm:w-44">
        <option value="BACKGROUND">Background (foundation)</option>
        <option value="OPTIONAL">Optional (exploration)</option>
        <option value="REQUIRED">In my syllabus</option>
      </Select>
      <Select name="unitId" aria-label="Unit" className="sm:w-56">
        <option value="">No unit</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.title}
          </option>
        ))}
      </Select>
      <SubmitButton variant="secondary">Add</SubmitButton>
    </ActionForm>
  );
}
