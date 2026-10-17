import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { aiStatus } from "@/server/ai";
import { getSubject } from "@/server/services/subjects";
import { SyllabusUploadForm } from "@/components/learn/syllabus-upload";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Add a syllabus" };

export default async function NewSyllabusPage(props: PageProps<"/learn/[subjectId]/syllabus/new">) {
  const user = await requireUser();
  const { subjectId } = await props.params;
  const subject = await getSubject(user.id, subjectId);
  if (!subject) notFound();
  const ai = aiStatus();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/learn/${subject.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {subject.name}
      </Link>
      <PageHeader
        title={`Add your ${subject.name} syllabus`}
        description="Kadam reads it, shows you what it found — including anything it's unsure about — and builds your roadmap once you confirm."
      />
      <Card className="p-5 sm:p-6">
        <SyllabusUploadForm subjectId={subject.id} subjectName={subject.name} maxMb={env().MAX_UPLOAD_MB} aiVision={ai.configured && !ai.simulated} />
      </Card>
    </div>
  );
}
