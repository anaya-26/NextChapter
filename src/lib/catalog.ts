/**
 * Suggestions shown as chips. Students can always type their own value; nothing here is
 * used to judge eligibility.
 */

export const EDUCATION_STAGES = [
  { value: "SCHOOL", label: "School (up to Class 10)" },
  { value: "HIGHER_SECONDARY", label: "Higher secondary (Class 11–12)" },
  { value: "UNDERGRADUATE", label: "Undergraduate (degree)" },
  { value: "POSTGRADUATE", label: "Postgraduate" },
  { value: "DIPLOMA", label: "Diploma / polytechnic / ITI" },
  { value: "COMPETITIVE_EXAM", label: "Preparing for a competitive exam" },
  { value: "OTHER", label: "Something else" },
] as const;

export const AGE_BANDS = [
  { value: "UNDER_13", label: "Under 13" },
  { value: "TEEN_13_15", label: "13–15" },
  { value: "TEEN_16_17", label: "16–17" },
  { value: "ADULT", label: "18 or older" },
  { value: "UNDISCLOSED", label: "Prefer not to say" },
] as const;

export const BOARDS = [
  "CBSE",
  "CISCE (ICSE / ISC)",
  "NIOS",
  "Maharashtra State Board",
  "UP Board",
  "Karnataka State Board",
  "Tamil Nadu State Board",
  "West Bengal Board",
  "Bihar School Examination Board",
  "Gujarat State Board",
  "IB",
  "Cambridge (IGCSE / A Level)",
];

export const EXAM_TARGETS = [
  "Class 10 board exams",
  "Class 12 board exams",
  "JEE Main",
  "JEE Advanced",
  "NEET-UG",
  "CUET-UG",
  "CUET-PG",
  "CLAT",
  "NDA",
  "UPSC Civil Services",
  "MPSC",
  "SSC CGL",
  "IBPS / SBI PO",
  "RRB NTPC",
  "GATE",
  "CAT",
  "CA Foundation",
  "NEET-PG",
  "Olympiads",
  "University semester exams",
];

export const DOMAINS = [
  "Software engineering",
  "Data science & AI",
  "Design (UI/UX, product)",
  "Product management",
  "Finance & banking",
  "Chartered accountancy",
  "Medicine & healthcare",
  "Law",
  "Civil services",
  "Teaching & education",
  "Research & academia",
  "Core engineering (mechanical, civil, electrical)",
  "Electronics & semiconductors",
  "Marketing & communications",
  "Journalism & media",
  "Architecture",
  "Biotechnology & life sciences",
  "Psychology",
  "Entrepreneurship",
  "Defence services",
  "Agriculture & food",
  "Environment & sustainability",
];

export const WORK_MODES = [
  { value: "REMOTE", label: "Remote" },
  { value: "ONSITE", label: "On-site" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

export const STUDY_TIMES = [
  { value: "EARLY_MORNING", label: "Early morning (5–8)" },
  { value: "MORNING", label: "Morning (8–12)" },
  { value: "AFTERNOON", label: "Afternoon (12–5)" },
  { value: "EVENING", label: "Evening (5–9)" },
  { value: "NIGHT", label: "Night (9–12)" },
] as const;

export const COMMITMENT_KINDS = [
  { value: "CLASS", label: "Class / lectures" },
  { value: "COACHING", label: "Coaching / tuition" },
  { value: "COMMUTE", label: "Commute" },
  { value: "WORK", label: "Job / part-time work" },
  { value: "CHORES", label: "Household responsibilities" },
  { value: "FAMILY", label: "Family time" },
  { value: "HEALTH", label: "Exercise / health" },
  { value: "SLEEP", label: "Sleep" },
  { value: "OTHER", label: "Other" },
] as const;

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi (हिन्दी)" },
  { value: "mr", label: "Marathi (मराठी)" },
] as const;

export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
