// Shared constants and types for NSUMatch. Data lives in Lovable Cloud now.
export type Department = "SBE" | "ECE" | "SHSS" | "SEPS";
export type LocationKey = "none" | "cafe" | "plaza" | "library";

export type DBProfile = {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  age: number;
  bio: string;
  department: Department;
  major: string;
  photo_url: string;
  photos: string[];
  free_slots: string[];
  location: LocationKey;
  ghost_from_depts: Department[];
  verified: boolean;
  id_card_uploaded: boolean;
  onboarding_complete: boolean;
  verification_status: VerificationStatus;
  verification_note: string | null;
  id_card_path: string | null;
};

export type VerificationStatus = "none" | "pending" | "approved" | "rejected";

export const NSU_EMAIL_REGEX = /^[^\s@]+@northsouth\.edu$/i;

/**
 * Columns the `authenticated` role may SELECT on `profiles`.
 * The `email` column is revoked at the database level (privacy), so
 * `select("*")` fails with "permission denied". Always use this list and
 * read the viewer's own email from the auth session instead.
 */
export const PROFILE_COLUMNS =
  "id,user_id,first_name,age,bio,department,major,photo_url,photos,free_slots,location,ghost_from_depts,verified,id_card_uploaded,onboarding_complete,verification_status";

/** Private storage bucket for student ID photos (owner + admins only). */
export const ID_CARD_BUCKET = "id-cards";

/** Stored photos are object paths; recognize legacy signed URLs during rollout. */
export function profilePhotoPath(value: string): string | null {
  if (/^[0-9a-f-]{36}\/[^?#]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    const prefix = "/storage/v1/object/sign/profile-photos/";
    return url.pathname.startsWith(prefix)
      ? decodeURIComponent(url.pathname.slice(prefix.length))
      : null;
  } catch {
    return null;
  }
}

/** All photos for a profile, falling back to the main photo. */
export function profilePhotos(p: Pick<DBProfile, "photos" | "photo_url">): string[] {
  const list = (p.photos ?? []).filter(Boolean);
  return list.length ? list : [p.photo_url];
}

/** Profile completeness 0–100 — nudges users to fill out their profile. */
export function profileCompleteness(p: DBProfile): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [profilePhotos(p).length >= 3, "Add 3+ photos"],
    [p.bio.trim().length >= 40, "Write a longer bio"],
    [p.free_slots.length > 0, "Add your free slots"],
    [p.location !== "none", "Check in on campus"],
    [p.verified || p.verification_status === "pending", "Verify your NSU ID"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    score: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}

/** Light haptic tap on Android (iOS Safari ignores navigator.vibrate). */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const DEPARTMENTS: { value: Department; label: string; short: string }[] = [
  { value: "SBE", label: "SBE — Business & Economics", short: "SBE" },
  { value: "ECE", label: "ECE — Electrical & Computer Engineering", short: "ECE" },
  { value: "SHSS", label: "SHSS — Humanities & Social Sciences", short: "SHSS" },
  { value: "SEPS", label: "SEPS — Environmental & Pharmaceutical Sciences", short: "SEPS" },
];

export const LOCATIONS: { key: LocationKey; emoji: string; label: string }[] = [
  { key: "cafe", emoji: "☕", label: "Grabbing coffee at the Cafeteria" },
  { key: "plaza", emoji: "🏛️", label: "Chilling at the Open Plaza" },
  { key: "library", emoji: "📚", label: "Suffering in the Library" },
  { key: "none", emoji: "•", label: "Off campus" },
];

export const ALL_SLOTS = [
  "ST 09:40 AM",
  "ST 11:20 AM",
  "ST 01:10 PM",
  "MW 11:20 AM",
  "MW 01:10 PM",
  "MW 02:40 PM",
  "R 11:20 AM",
  "R 01:10 PM",
  "R 02:40 PM",
];

export function mutualSlots(a: string[], b: string[]) {
  return a.filter((s) => b.includes(s));
}

export const ICEBREAKERS = [
  "On a scale of 1 to getting advised by a strict professor, how stressful was your week?",
  "Cafeteria singara or NSU cafe coffee — which is the bigger scam?",
  "If our schedules matched, would you skip class with me for a tong tea?",
  "Library 2nd floor or Open Plaza — where do you secretly study?",
  "Honest answer: how many times have you queued for the elevator today?",
  "Pick one: 8 AM class or a 5-page take-home final due tonight?",
];
