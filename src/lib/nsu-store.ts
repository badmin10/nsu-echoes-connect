// Simple mock store for NSUMatch MVP. Client-only, persisted in localStorage.
import { useEffect, useState } from "react";

export type Department = "SBE" | "ECE" | "SHSS" | "SEPS";

export type FreeSlot = string; // e.g., "ST 09:40 AM"

export type CampusLocation =
  | { key: "cafe"; emoji: "☕"; label: "Grabbing coffee at the Cafeteria" }
  | { key: "plaza"; emoji: "🏛️"; label: "Chilling at the Open Plaza" }
  | { key: "library"; emoji: "📚"; label: "Suffering in the Library" }
  | { key: "none"; emoji: "•"; label: "Off campus" };

export const LOCATIONS: CampusLocation[] = [
  { key: "cafe", emoji: "☕", label: "Grabbing coffee at the Cafeteria" },
  { key: "plaza", emoji: "🏛️", label: "Chilling at the Open Plaza" },
  { key: "library", emoji: "📚", label: "Suffering in the Library" },
  { key: "none", emoji: "•", label: "Off campus" },
];

export type Profile = {
  id: string;
  email: string;
  firstName: string;
  age: number;
  bio: string;
  department: Department;
  major: string;
  photo: string; // url
  verified: boolean;
  freeSlots: FreeSlot[];
  location: CampusLocation["key"];
  ghostFromDepts: Department[];
};

export type User = Profile & {
  idCardPhoto?: string;
};

const LS_USER = "nsumatch:user";
const LS_STATE = "nsumatch:state";

export type AppState = {
  liked: string[];
  passed: string[];
  matches: string[];
  teaSent: string[];
  crushEmails: string[];
  messages: Record<string, { from: "me" | "them"; text: string; at: number }[]>;
};

const defaultState: AppState = {
  liked: [],
  passed: [],
  matches: [],
  teaSent: [],
  crushEmails: [],
  messages: {},
};

export const MOCK_PROFILES: Profile[] = [
  {
    id: "p1",
    email: "ayesha.k@northsouth.edu",
    firstName: "Ayesha",
    age: 21,
    bio: "Chai > Coffee. Looking for a thesis-survivor partner.",
    department: "SBE",
    major: "Marketing",
    photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80",
    verified: true,
    freeSlots: ["ST 09:40 AM", "MW 01:10 PM", "R 11:20 AM"],
    location: "cafe",
    ghostFromDepts: [],
  },
  {
    id: "p2",
    email: "rafi.h@northsouth.edu",
    firstName: "Rafi",
    age: 22,
    bio: "CSE senior. I debug feelings too.",
    department: "ECE",
    major: "Computer Science",
    photo: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=800&q=80",
    verified: true,
    freeSlots: ["MW 02:40 PM", "ST 11:20 AM"],
    location: "library",
    ghostFromDepts: [],
  },
  {
    id: "p3",
    email: "nabila.r@northsouth.edu",
    firstName: "Nabila",
    age: 20,
    bio: "English Lit. Will judge your bookshelf.",
    department: "SHSS",
    major: "English",
    photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80",
    verified: true,
    freeSlots: ["R 01:10 PM", "ST 09:40 AM"],
    location: "plaza",
    ghostFromDepts: [],
  },
  {
    id: "p4",
    email: "tahmid.a@northsouth.edu",
    firstName: "Tahmid",
    age: 23,
    bio: "Econ + cricket + dhaba food. In that order.",
    department: "SBE",
    major: "Economics",
    photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&q=80",
    verified: true,
    freeSlots: ["MW 11:20 AM", "R 02:40 PM"],
    location: "cafe",
    ghostFromDepts: [],
  },
  {
    id: "p5",
    email: "samira.j@northsouth.edu",
    firstName: "Samira",
    age: 21,
    bio: "Public Health. Will remind you to drink water.",
    department: "SHSS",
    major: "Public Health",
    photo: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80",
    verified: false,
    freeSlots: ["ST 01:10 PM"],
    location: "none",
    ghostFromDepts: [],
  },
  {
    id: "p6",
    email: "imran.s@northsouth.edu",
    firstName: "Imran",
    age: 22,
    bio: "EEE. Capacitors and conversations.",
    department: "ECE",
    major: "Electrical Engineering",
    photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80",
    verified: true,
    freeSlots: ["MW 01:10 PM", "R 11:20 AM"],
    location: "library",
    ghostFromDepts: [],
  },
];

// ----- raw helpers -----
export function loadUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
export function saveUser(u: User | null) {
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
  else localStorage.removeItem(LS_USER);
  window.dispatchEvent(new Event("nsumatch:update"));
}
export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(LS_STATE);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch {
    return defaultState;
  }
}
export function saveState(s: AppState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_STATE, JSON.stringify(s));
  window.dispatchEvent(new Event("nsumatch:update"));
}

// ----- React hooks -----
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    setUser(loadUser());
    const h = () => setUser(loadUser());
    window.addEventListener("nsumatch:update", h);
    return () => window.removeEventListener("nsumatch:update", h);
  }, []);
  return [user, (u: User | null) => saveUser(u)] as const;
}

export function useAppState() {
  const [state, setState] = useState<AppState>(defaultState);
  useEffect(() => {
    setState(loadState());
    const h = () => setState(loadState());
    window.addEventListener("nsumatch:update", h);
    return () => window.removeEventListener("nsumatch:update", h);
  }, []);
  const update = (partial: Partial<AppState> | ((s: AppState) => AppState)) => {
    const next =
      typeof partial === "function" ? partial(loadState()) : { ...loadState(), ...partial };
    saveState(next);
  };
  return [state, update] as const;
}

// ----- domain helpers -----
export const NSU_EMAIL_REGEX = /^[^\s@]+@northsouth\.edu$/i;

export const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: "SBE", label: "SBE — School of Business & Economics" },
  { value: "ECE", label: "ECE — Electrical & Computer Engineering" },
  { value: "SHSS", label: "SHSS — Humanities & Social Sciences" },
  { value: "SEPS", label: "SEPS — Environmental & Pharmaceutical Sciences" },
];

export const ALL_SLOTS: FreeSlot[] = [
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

export function mutualSlots(a: FreeSlot[], b: FreeSlot[]) {
  return a.filter((s) => b.includes(s));
}

export function getProfileById(id: string): Profile | undefined {
  return MOCK_PROFILES.find((p) => p.id === id);
}

export const ICEBREAKERS = [
  "On a scale of 1 to getting advised by a strict professor, how stressful was your week?",
  "Cafeteria singara or NSU cafe coffee — which is the bigger scam?",
  "If our schedules matched, would you skip class with me for a tong tea?",
  "Library 2nd floor or Open Plaza — where do you secretly study?",
  "Honest answer: how many times have you queued for the elevator today?",
  "Pick one: 8 AM class or a 5-page take-home final due tonight?",
];
