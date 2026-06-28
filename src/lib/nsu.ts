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
  free_slots: string[];
  location: LocationKey;
  ghost_from_depts: Department[];
  verified: boolean;
  id_card_uploaded: boolean;
  onboarding_complete: boolean;
};

export const NSU_EMAIL_REGEX = /^[^\s@]+@northsouth\.edu$/i;

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
