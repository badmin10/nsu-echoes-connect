// Unmatch / block / report. All enforced in the database (see migration
// 20261113130000_safety_photos_push.sql); these are thin wrappers.
import { supabase } from "@/integrations/supabase/client";

export const REPORT_REASONS = [
  { value: "fake_profile", label: "Fake profile or catfish" },
  { value: "harassment", label: "Harassment or threats" },
  { value: "inappropriate_photos", label: "Inappropriate photos or messages" },
  { value: "spam_or_scam", label: "Spam, scam or asking for money" },
  { value: "underage", label: "Seems under 17" },
  { value: "not_nsu", label: "Not an NSU student" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const reasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

export async function unmatch(profileId: string) {
  const { error } = await supabase.rpc("unmatch", { target: profileId });
  return { error: error?.message ?? null };
}

export async function blockProfile(profileId: string) {
  const { error } = await supabase.rpc("block_profile", { target: profileId });
  return { error: error?.message ?? null };
}

export async function unblockProfile(blockId: string) {
  const { error } = await supabase.from("blocks").delete().eq("id", blockId);
  return { error: error?.message ?? null };
}

export async function reportProfile(
  me: string,
  profileId: string,
  reason: ReportReason,
  details: string,
) {
  const { error } = await supabase.from("reports").insert({
    reporter_profile_id: me,
    reported_profile_id: profileId,
    reason,
    details: details.trim().slice(0, 1000) || null,
  });
  return { error: error?.message ?? null };
}

/** People I've blocked (their profiles are hidden by RLS, so we only show the date). */
export async function fetchMyBlocks(me: string) {
  const { data } = await supabase
    .from("blocks")
    .select("id,blocked_profile_id,created_at")
    .eq("blocker_profile_id", me)
    .order("created_at", { ascending: false });
  return data ?? [];
}
