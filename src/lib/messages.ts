// Real messaging backed by the `messages` table + Supabase Realtime.
// RLS only lets mutual matches message each other (see migration
// 20261113120000_messaging_verification_admin.sql).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { notify } from "./push";

export type Message = Tables<"messages">;
/** A message in the UI; optimistic ones carry a local status until the server confirms. */
export type UIMessage = Message & {
  status?: "sending" | "failed";
  /** Local object URL shown while a photo uploads. */
  localImage?: string;
  /** The original file, kept so a failed photo can be retried. */
  file?: File;
};

export const MAX_MESSAGE_LENGTH = 2000;
const READ_EVENT = "nsumatch:messages-read";

/** Stable topic name for a 1:1 conversation, identical for both people. */
export function dmTopic(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

export async function fetchConversation(me: string, other: string, limit = 300) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `and(from_profile_id.eq.${me},to_profile_id.eq.${other}),and(from_profile_id.eq.${other},to_profile_id.eq.${me})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return { messages: ((data as Message[]) ?? []).reverse(), error };
}

export async function sendMessage(me: string, other: string, body: string, imagePath?: string) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      from_profile_id: me,
      to_profile_id: other,
      body: body.slice(0, MAX_MESSAGE_LENGTH),
      ...(imagePath ? { image_path: imagePath } : {}),
    })
    .select("*")
    .single();
  if (data) notify({ type: "message", message_id: (data as Message).id });
  return { message: data as Message | null, error };
}

/** One-line preview for the chat list. */
export function messagePreview(m: Pick<Message, "body" | "image_path">) {
  if (m.image_path && !m.body.trim()) return "📷 Photo";
  return m.body;
}

export async function markConversationRead(me: string, other: string) {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("to_profile_id", me)
    .eq("from_profile_id", other)
    .is("read_at", null);
  if (!error && typeof window !== "undefined") window.dispatchEvent(new Event(READ_EVENT));
  return { error };
}

export async function isMutualMatch(me: string, other: string) {
  const { data, error } = await supabase.rpc("is_mutual_match", { a: me, b: other });
  return { match: !!data, error };
}

export type InboxEntry = { last: Message; unread: number };

/** Latest message + unread count per conversation partner. */
export async function fetchInbox(me: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`from_profile_id.eq.${me},to_profile_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(1000);
  const inbox = new Map<string, InboxEntry>();
  for (const m of (data as Message[]) ?? []) {
    const other = m.from_profile_id === me ? m.to_profile_id : m.from_profile_id;
    const entry = inbox.get(other) ?? { last: m, unread: 0 };
    if (m.to_profile_id === me && !m.read_at) entry.unread += 1;
    inbox.set(other, entry);
  }
  return { inbox, error };
}

/** Live count of unread messages for the tab-bar badge. */
export function useUnreadCount(me: string | null) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!me) return;
    const { count: c } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("to_profile_id", me)
      .is("read_at", null);
    setCount(c ?? 0);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    refresh();
    const channel = supabase
      .channel(`unread:${me}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `to_profile_id=eq.${me}` },
        () => refresh(),
      )
      .subscribe();
    const onRead = () => refresh();
    window.addEventListener(READ_EVENT, onRead);
    return () => {
      window.removeEventListener(READ_EVENT, onRead);
      supabase.removeChannel(channel);
    };
  }, [me, refresh]);

  return count;
}
