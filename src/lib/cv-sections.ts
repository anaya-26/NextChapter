export const SECTION_KEYS = ["summary", "education", "experience", "projects", "achievements", "skills"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  education: "Education",
  experience: "Experience & responsibilities",
  projects: "Projects",
  achievements: "Achievements & certificates",
  skills: "Skills",
};
