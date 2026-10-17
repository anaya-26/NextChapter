"use client";

import type { ReactNode } from "react";
import { EXAM_TARGETS } from "@/lib/catalog";
import { saveProfileSection } from "@/app/(app)/settings/actions";
import { StepBasics, StepCompanion, StepEducation, StepGoals, StepTime, type ProfileInit } from "@/app/(app)/onboarding/wizard";
import { ActionForm } from "@/components/forms/action-form";
import { TagInput } from "@/components/forms/inputs";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";

function Section({ section, children }: { section: Parameters<typeof saveProfileSection>[0]; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <ActionForm action={saveProfileSection.bind(null, section)} className="flex flex-col gap-5">
        {children}
        <div className="flex justify-end">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

export function ProfileSections({ profile, privacy }: { profile: ProfileInit; privacy: { aiUseJournal: boolean; aiInferPatterns: boolean } }) {
  return (
    <div className="flex flex-col gap-4">
      <Section section="basics">
        <StepBasics p={profile} />
      </Section>
      <Section section="education">
        <StepEducation p={profile} />
      </Section>
      <Section section="exams">
        <div>
          <h2 className="text-xl font-semibold">Exam targets</h2>
          <p className="mt-1 text-sm text-muted">Subjects are managed in Learn, where each gets its own roadmap.</p>
        </div>
        <TagInput name="examTargets" label="Exam targets" suggestions={EXAM_TARGETS} defaultValue={profile.examTargets} />
      </Section>
      <Section section="time">
        <StepTime p={profile} />
      </Section>
      <Section section="goals">
        <StepGoals p={profile} inSettings />
      </Section>
      <Section section="companion">
        <StepCompanion p={profile} privacy={privacy} inSettings />
      </Section>
    </div>
  );
}
