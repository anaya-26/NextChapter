/**
 * Safety rules for the community, kept pure so they can be tested. Community identities are
 * pseudonymous handles; contact details can't be posted, so students can't be pulled into
 * private channels from here.
 */

const PHONE = /(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MESSAGING = /\b(whats\s?app|wa\.me|telegram|t\.me\/|snap(chat)?|insta(gram)?\s*(id|handle)?|dm me|message me on|call me|my number)\b/i;

/** Returns a reason if the text shares contact details or invites off-platform contact. */
export function contactInfoReason(text: string): string | null {
  if (EMAIL.test(text)) return "email addresses";
  if (PHONE.test(text.replace(/[()]/g, ""))) return "phone numbers";
  if (MESSAGING.test(text)) return "messaging or social media contacts";
  return null;
}

export const HANDLE_RULES = "3–20 letters, numbers or underscores. Don’t use your real name, school or anything that identifies you.";

export function handleProblem(handle: string): string | null {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) return `Use ${HANDLE_RULES.charAt(0).toLowerCase()}${HANDLE_RULES.slice(1)}`;
  if (/\d{6,}/.test(handle)) return "Avoid long numbers — they can look like phone numbers or roll numbers";
  if (/^(admin|moderator|mod|kadam|support|official)/i.test(handle)) return "That handle is reserved";
  return null;
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 48) || "group"
  );
}

/** Reports needed before content is hidden pending review: stricter where younger students are. */
export function autoHideThreshold(audience: "ALL_AGES" | "TEENS" | "ADULTS") {
  return audience === "ADULTS" ? 3 : 2;
}

/** "Incorrect or outdated" flags after which a resource shows a warning. */
export const INCORRECT_WARNING_AT = 2;

export const COMMUNITY_GUIDELINES = [
  "Be kind. Disagree with ideas, not people.",
  "Share your own work, or say exactly where something comes from.",
  "No phone numbers, emails or social media handles — yours or anyone else’s.",
  "Don’t share exam papers or material you don’t have the right to share.",
  "If an explanation or resource is wrong, flag it or explain why — politely.",
  "If someone seems to be in danger, report the post. Moderators see it first.",
];
