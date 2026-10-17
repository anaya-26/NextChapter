/** Age bands treated as children (under 18) under India's DPDP Act. */
export const MINOR_BANDS = ["UNDER_13", "TEEN_13_15", "TEEN_16_17"] as const;

export function isMinorBand(band: string | null | undefined): boolean {
  return !!band && (MINOR_BANDS as readonly string[]).includes(band);
}

/** Community audiences a student may join, by age band. */
export function allowedAudiences(band: string | null | undefined): ("ALL_AGES" | "TEENS" | "ADULTS")[] {
  if (band === "ADULT") return ["ALL_AGES", "ADULTS"];
  if (band === "TEEN_13_15" || band === "TEEN_16_17") return ["ALL_AGES", "TEENS"];
  if (band === "UNDER_13") return ["ALL_AGES"];
  // Undisclosed: only the strictly moderated all-ages spaces.
  return ["ALL_AGES"];
}
