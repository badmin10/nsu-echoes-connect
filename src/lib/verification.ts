import { supabase } from "@/integrations/supabase/client";
import { ID_CARD_BUCKET } from "./nsu";

const MAX_ID_BYTES = 8 * 1024 * 1024;

/**
 * Uploads a student-ID photo to the private `id-cards` bucket under the
 * user's own folder (storage RLS requires `<auth uid>/...`). Only the owner
 * and admins can read it back. Returns the storage path.
 */
export async function uploadIdCard(userId: string, file: File) {
  if (!file.type.startsWith("image/"))
    return { path: null, error: "Please choose a photo of your ID." };
  if (file.size > MAX_ID_BYTES)
    return { path: null, error: "That photo is over 8 MB. Try a smaller one." };
  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/id-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(ID_CARD_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return { path: error ? null : path, error: error?.message ?? null };
}

/** Marks the profile as waiting for admin review (the DB only allows this with an ID on file). */
export async function submitForReview(profileId: string, path: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ id_card_path: path, id_card_uploaded: true, verification_status: "pending" })
    .eq("id", profileId);
  return { error: error?.message ?? null };
}

/** Short-lived link so an admin (or the owner) can view a private ID photo. */
export async function idCardUrl(path: string) {
  const { data } = await supabase.storage.from(ID_CARD_BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
