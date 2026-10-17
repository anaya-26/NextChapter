/** Labels and colours for calendar item kinds (shared by server and client components). */
export const KIND_META: Record<string, { label: string; chip: string; dot: string }> = {
  CLASS: { label: "Class", chip: "bg-info-soft text-info border-info/30", dot: "bg-info" },
  ASSIGNMENT: { label: "Assignment", chip: "bg-accent-soft text-accent-soft-fg border-accent/40", dot: "bg-accent" },
  EXAM: { label: "Exam", chip: "bg-danger-soft text-danger border-danger/30", dot: "bg-danger" },
  REVISION: { label: "Revision", chip: "bg-primary-soft text-primary-soft-fg border-primary/30", dot: "bg-primary" },
  STUDY: { label: "Study", chip: "bg-primary-soft text-primary-soft-fg border-primary/30", dot: "bg-primary" },
  PROJECT: { label: "Project", chip: "bg-accent-soft text-accent-soft-fg border-accent/30", dot: "bg-accent" },
  FOCUS: { label: "Focus", chip: "bg-primary-soft text-primary-soft-fg border-primary/30", dot: "bg-primary" },
  APPLICATION: { label: "Application", chip: "bg-warning-soft text-warning border-warning/30", dot: "bg-warning" },
  PERSONAL: { label: "Personal", chip: "bg-surface-2 text-fg border-border-strong", dot: "bg-subtle" },
  REMINDER: { label: "Reminder", chip: "bg-surface-2 text-fg border-border-strong", dot: "bg-subtle" },
  COMMITMENT: { label: "Commitment", chip: "bg-surface-2/80 text-muted border-dashed border-border-strong", dot: "bg-border-strong" },
  BUSY: { label: "Busy", chip: "bg-[repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2)_6px,var(--surface)_6px,var(--surface)_12px)] text-muted border-border", dot: "bg-border-strong" },
};

export const EVENT_KINDS = ["STUDY", "REVISION", "CLASS", "EXAM", "ASSIGNMENT", "PROJECT", "FOCUS", "APPLICATION", "PERSONAL", "REMINDER"] as const;

export const REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At the start" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
  { value: "1440,60", label: "1 day and 1 hour before" },
  { value: "1440,120", label: "1 day and 2 hours before" },
];

export type EventFormValues = {
  title: string;
  kind: string;
  date: string;
  start: string;
  duration: number;
  allDay: boolean;
  repeat: "NONE" | "DAILY" | "WEEKLY";
  days: number[];
  until: string;
  reminder: string;
  countdown: boolean;
  deadline: boolean;
  estimate: number | null;
  location: string;
  description: string;
  topicId: string | null;
};

export type CalItem = {
  key: string;
  eventId: string | null;
  title: string;
  kind: string;
  commitmentKind?: string;
  dateKey: string;
  startMin: number;
  endMin: number;
  timeLabel: string;
  whenLabel: string;
  allDay: boolean;
  isDeadline: boolean;
  status: string | null;
  source: string;
  ruleText: string | null;
  topicHref: string | null;
  topicTitle: string | null;
  sessionId: string | null;
  sessionStatus: string | null;
  location: string | null;
  description: string | null;
  isDemo: boolean;
  syncState: string | null;
  edit: EventFormValues | null;
  lane: number;
  lanes: number;
};
