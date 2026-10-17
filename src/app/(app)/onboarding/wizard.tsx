"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AGE_BANDS, BOARDS, COMMON_TIMEZONES, DOMAINS, EDUCATION_STAGES, EXAM_TARGETS, LANGUAGES, STUDY_TIMES } from "@/lib/catalog";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { ChoiceCards, TagInput, ToneSlider } from "@/components/forms/inputs";
import { CommitmentForm, CommitmentList, type CommitmentRow } from "@/components/settings/commitment-editor";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Notice, Progress } from "@/components/ui/feedback";
import { saveOnboardingStep, skipOnboarding } from "./actions";
import { ONBOARDING_STEPS, STEP_TITLES } from "./steps";

export type ProfileInit = {
  displayName: string;
  ageBand: string;
  preferredLanguage: string;
  educationStage: string | null;
  boardOrUniversity: string | null;
  institution: string | null;
  course: string | null;
  yearOrClass: string | null;
  qualificationsDone: string[];
  qualificationsPursuing: string[];
  examTargets: string[];
  weeklyStudyHoursTarget: number | null;
  preferredStudyTimes: string[];
  timezone: string;
  careerClarity: string | null;
  selectedDomains: string[];
  interests: string[];
  skills: string[];
  ambitions: string | null;
  companionTone: number;
  coachingIntensity: string;
  reminderFrequency: string;
  explanationLanguage: string;
  examAnswerLanguage: string;
  quietMode: boolean;
  minor: boolean;
  consentRecorded: boolean;
};

export function OnboardingWizard({
  step,
  profile,
  privacy,
  subjects,
  commitments,
}: {
  step: number;
  profile: ProfileInit;
  privacy: { aiUseJournal: boolean; aiInferPatterns: boolean };
  subjects: string[];
  commitments: CommitmentRow[];
}) {
  const action = saveOnboardingStep.bind(null, step);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Step {step} of {ONBOARDING_STEPS} · {STEP_TITLES[step - 1]}
          </span>
          <form action={skipOnboarding}>
            <button type="submit" className="cursor-pointer underline-offset-4 hover:underline">
              Finish later
            </button>
          </form>
        </div>
        <Progress value={(step / ONBOARDING_STEPS) * 100} label="Profile setup progress" />
      </div>

      <Card className="p-5 sm:p-7">
        <ActionForm action={action} className="flex flex-col gap-5">
          {step === 1 ? <StepBasics p={profile} /> : null}
          {step === 2 ? <StepEducation p={profile} /> : null}
          {step === 3 ? <StepExams p={profile} subjects={subjects} /> : null}
          {step === 4 ? <StepTime p={profile} /> : null}
          {step === 5 ? <StepGoals p={profile} /> : null}
          {step === 6 ? <StepCompanion p={profile} privacy={privacy} /> : null}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            {step > 1 ? (
              <Link href={`/onboarding?step=${step - 1}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Link>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {step < ONBOARDING_STEPS ? (
                <Link href={`/onboarding?step=${step + 1}`} className="text-sm text-muted hover:text-fg">
                  Skip
                </Link>
              ) : null}
              <SubmitButton pendingLabel="Saving…">{step === ONBOARDING_STEPS ? "Finish" : "Save & continue"}</SubmitButton>
            </div>
          </div>
        </ActionForm>
        {step === 4 ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
            <h3 className="font-semibold">Regular commitments</h3>
            <p className="text-sm text-muted">Classes, coaching, commute and responsibilities. Plans will only use the time that is genuinely free.</p>
            <CommitmentList commitments={commitments} />
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a commitment</summary>
              <div className="pt-3">
                <CommitmentForm />
              </div>
            </details>
          </div>
        ) : null}
      </Card>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4" aria-hidden /> Everything here is private and editable later in Settings.
      </p>
    </div>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

export function StepBasics({ p }: { p: ProfileInit }) {
  return (
    <>
      <Heading title="Welcome! Let's set up NextChapter for you" text="A few quick questions. You can skip anything and add it later." />
      <Field label="What should NextChapter call you?" htmlFor="displayName">
        <Input id="displayName" name="displayName" defaultValue={p.displayName} maxLength={60} />
        <FieldError name="displayName" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Your age group</legend>
        <ChoiceCards name="ageBand" options={AGE_BANDS} defaultValue={p.ageBand} columns={3} />
        <p className="text-xs text-muted">
          Used to keep community spaces age-appropriate and to apply extra privacy protections for students under 18.
        </p>
      </fieldset>
      <Field label="App language" htmlFor="preferredLanguage" hint="Hindi and Marathi translations are in progress; some text stays in English for now.">
        <Select id="preferredLanguage" name="preferredLanguage" defaultValue={p.preferredLanguage}>
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

export function StepEducation({ p }: { p: ProfileInit }) {
  return (
    <>
      <Heading title="Your education" text="This helps match explanations, examples and practice to your level and syllabus." />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Where are you now?</legend>
        <ChoiceCards name="educationStage" options={EDUCATION_STAGES} defaultValue={p.educationStage} />
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Board or university" htmlFor="boardOrUniversity" hint={`e.g. ${BOARDS.slice(0, 3).join(", ")} or your university`}>
          <Input id="boardOrUniversity" name="boardOrUniversity" defaultValue={p.boardOrUniversity ?? ""} list="boards" />
          <datalist id="boards">
            {BOARDS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="School / college / institute" htmlFor="institution">
          <Input id="institution" name="institution" defaultValue={p.institution ?? ""} />
        </Field>
        <Field label="Course or stream" htmlFor="course" hint="e.g. Class 12 Science (PCM), B.Com, B.Tech CSE">
          <Input id="course" name="course" defaultValue={p.course ?? ""} />
        </Field>
        <Field label="Year / class / semester" htmlFor="yearOrClass">
          <Input id="yearOrClass" name="yearOrClass" defaultValue={p.yearOrClass ?? ""} placeholder="e.g. Class 11, 2nd year, Sem 3" />
        </Field>
      </div>
      <TagInput name="qualificationsDone" label="Qualifications completed" defaultValue={p.qualificationsDone} placeholder="e.g. Class 10 (CBSE)" />
      <TagInput name="qualificationsPursuing" label="Currently pursuing" defaultValue={p.qualificationsPursuing} placeholder="e.g. B.Sc Physics, CA Foundation" />
    </>
  );
}

export function StepExams({ p, subjects }: { p: ProfileInit; subjects: string[] }) {
  return (
    <>
      <Heading title="Exams and subjects" text="Add the exams you're preparing for and the subjects you're studying now." />
      <TagInput name="examTargets" label="Exam targets" suggestions={EXAM_TARGETS} defaultValue={p.examTargets} />
      <TagInput
        name="subjects"
        label="Subjects"
        defaultValue={subjects}
        suggestions={["Physics", "Chemistry", "Mathematics", "Biology", "English", "Economics", "Accountancy", "History", "Computer Science"]}
        hint="Each subject gets its own roadmap once you add a syllabus."
      />
    </>
  );
}

export function StepTime({ p }: { p: ProfileInit }) {
  return (
    <>
      <Heading title="Your time" text="Realistic plans start from the time you actually have." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Hours per week you'd like to study" htmlFor="weeklyStudyHoursTarget" hint="Outside classes. A rough number is fine.">
          <Input id="weeklyStudyHoursTarget" name="weeklyStudyHoursTarget" type="number" min={0} max={100} defaultValue={p.weeklyStudyHoursTarget ?? ""} />
          <FieldError name="weeklyStudyHoursTarget" />
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue={p.timezone}>
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz === "Asia/Kolkata" ? "India (Asia/Kolkata)" : tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">When do you usually study best?</legend>
        <div className="flex flex-wrap gap-2">
          {STUDY_TIMES.map((t) => (
            <label key={t.value} className="cursor-pointer">
              <input type="checkbox" name="preferredStudyTimes" value={t.value} defaultChecked={p.preferredStudyTimes.includes(t.value)} className="peer sr-only" />
              <span className="inline-flex rounded-full border border-border-strong px-3 py-1.5 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function StepGoals({ p, inSettings = false }: { p: ProfileInit; inSettings?: boolean }) {
  return (
    <>
      <Heading title="Goals and interests" text="It's completely fine not to know your career yet — NextChapter supports exploring too." />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How clear is your career direction?</legend>
        <ChoiceCards
          name="careerClarity"
          defaultValue={p.careerClarity}
          columns={3}
          options={[
            { value: "CLEAR", label: "I know my direction", description: "Plan skills, projects and internships now" },
            { value: "EXPLORING", label: "Exploring options", description: "Try small projects and compare" },
            { value: "UNSURE", label: "Not sure yet", description: "We'll discover it from what you enjoy" },
          ]}
        />
      </fieldset>
      <TagInput name="selectedDomains" label="Domains you're drawn to" suggestions={DOMAINS} defaultValue={p.selectedDomains} max={10} />
      <TagInput name="interests" label="Interests" defaultValue={p.interests} placeholder="e.g. space, writing, cricket analytics" />
      <TagInput name="skills" label="Skills you already have" defaultValue={p.skills} placeholder="e.g. Python basics, public speaking" hint="Self-reported for now — later NextChapter distinguishes studying a subject from demonstrating a skill." />
      <Field label="Ambitions, in your own words (optional)" htmlFor="ambitions">
        <Textarea id="ambitions" name="ambitions" defaultValue={p.ambitions ?? ""} maxLength={600} />
      </Field>
      {inSettings ? null : (
        <Field label="One goal for the next few weeks (optional)" htmlFor="firstGoal" hint="This becomes your current priority on Today.">
          <Input id="firstGoal" name="firstGoal" placeholder="e.g. Finish Unit 1 of Physics before the unit test" maxLength={160} />
        </Field>
      )}
    </>
  );
}

export function StepCompanion({
  p,
  privacy,
  inSettings = false,
}: {
  p: ProfileInit;
  privacy: { aiUseJournal: boolean; aiInferPatterns: boolean };
  inSettings?: boolean;
}) {
  const patternsLocked = p.minor && !p.consentRecorded;
  return (
    <>
      <Heading title="Your companion" text="Choose how NextChapter talks to you and what it may use." />
      <ToneSlider name="companionTone" defaultValue={p.companionTone} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Coaching intensity" htmlFor="coachingIntensity">
          <Select id="coachingIntensity" name="coachingIntensity" defaultValue={p.coachingIntensity}>
            <option value="GENTLE">Gentle — one small step at a time</option>
            <option value="BALANCED">Balanced</option>
            <option value="FIRM">Firm — hold me to my plans</option>
          </Select>
        </Field>
        <Field label="Reminders" htmlFor="reminderFrequency">
          <Select id="reminderFrequency" name="reminderFrequency" defaultValue={p.reminderFrequency}>
            <option value="OFF">Off</option>
            <option value="MINIMAL">Minimal — deadlines only</option>
            <option value="NORMAL">Normal</option>
            <option value="FREQUENT">Frequent</option>
          </Select>
        </Field>
        <Field label="Explanations in" htmlFor="explanationLanguage" hint="Technical terms stay in English.">
          <Select id="explanationLanguage" name="explanationLanguage" defaultValue={p.explanationLanguage}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="I write exam answers in" htmlFor="examAnswerLanguage" hint="Model answers always use this language.">
          <Select id="examAnswerLanguage" name="examAnswerLanguage" defaultValue={p.examAnswerLanguage}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox name="quietMode" label="Quiet interface — fewer celebrations and animations" defaultChecked={p.quietMode} />
      {inSettings ? null : (
      <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <p className="text-sm font-medium">What the AI may use</p>
        <p className="text-sm text-muted">
          Your profile, goals, progress and calendar help NextChapter give relevant suggestions. Your journal stays private unless you allow it — and even then you choose each entry.
        </p>
        <Checkbox name="aiUseJournal" label="Allow the companion to read journal entries I mark as shareable" defaultChecked={privacy.aiUseJournal} />
        <Checkbox
          name="aiInferPatterns"
          label="Let NextChapter notice patterns (e.g. which study times work for me) — always shown as tentative"
          defaultChecked={privacy.aiInferPatterns && !patternsLocked}
          disabled={patternsLocked}
        />
        {patternsLocked ? (
          <Notice tone="info">Pattern noticing stays off for students under 18 until a parent or guardian gives consent (Settings → Privacy).</Notice>
        ) : null}
      </div>
      )}
    </>
  );
}
