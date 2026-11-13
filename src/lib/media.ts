// Photo messages: compress on-device, upload to the private `chat-media`
// bucket, and read back through short-lived signed URLs.
import { supabase } from "@/integrations/supabase/client";

export const CHAT_MEDIA_BUCKET = "chat-media";
const MAX_DIMENSION = 1600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Downscale to ≤1600px and re-encode as JPEG. Besides saving data on mobile,
 * re-encoding through a canvas strips EXIF metadata — including GPS location,
 * which phone cameras embed in photos.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file; // keep animations
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC on browsers that can't decode it
  }
}

/** Path layout required by storage RLS: <my auth uid>/<recipient profile id>/<file> */
export async function uploadChatImage(authUid: string, recipientProfileId: string, file: File) {
  if (!file.type.startsWith("image/")) return { path: null, error: "Only photos can be sent." };
  const blob = await compressImage(file);
  if (blob.size > MAX_UPLOAD_BYTES)
    return { path: null, error: "That photo is too large (10 MB max)." };
  const type = blob.type || file.type;
  const ext =
    type === "image/gif" ? "gif" : type === "image/jpeg" ? "jpg" : (type.split("/")[1] ?? "jpg");
  const path = `${authUid}/${recipientProfileId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  return { path: error ? null : path, error: error?.message ?? null };
}

const urlCache = new Map<string, { url: string; expires: number }>();

export async function chatImageUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}
