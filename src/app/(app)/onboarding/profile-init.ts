import type { StudentProfile } from "@/generated/prisma/client";
import { isMinorBand } from "@/lib/age";
import type { ProfileInit } from "./wizard";

export function toProfileInit(profile: StudentProfile, fallbackName: string): ProfileInit {
  return {
    displayName: profile.displayName ?? fallbackName.split(" ")[0] ?? "",
    ageBand: profile.ageBand,
    preferredLanguage: profile.preferredLanguage,
    educationStage: profile.educationStage,
    boardOrUniversity: profile.boardOrUniversity,
    institution: profile.institution,
    course: profile.course,
    yearOrClass: profile.yearOrClass,
    qualificationsDone: profile.qualificationsDone,
    qualificationsPursuing: profile.qualificationsPursuing,
    examTargets: profile.examTargets,
    weeklyStudyHoursTarget: profile.weeklyStudyHoursTarget,
    preferredStudyTimes: profile.preferredStudyTimes,
    timezone: profile.timezone,
    careerClarity: profile.careerClarity,
    selectedDomains: profile.selectedDomains,
    interests: profile.interests,
    skills: profile.skills,
    ambitions: profile.ambitions,
    companionTone: profile.companionTone,
    coachingIntensity: profile.coachingIntensity,
    reminderFrequency: profile.reminderFrequency,
    explanationLanguage: profile.explanationLanguage,
    examAnswerLanguage: profile.examAnswerLanguage,
    quietMode: profile.quietMode,
    minor: isMinorBand(profile.ageBand),
    consentRecorded: profile.guardianConsent === "RECORDED",
  };
}
