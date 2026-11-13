import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  ImagePlus,
  Lock,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { type DBProfile, haptic, ICEBREAKERS, PROFILE_COLUMNS } from "@/lib/nsu";
import {
  dmTopic,
  fetchConversation,
  isMutualMatch,
  markConversationRead,
  MAX_MESSAGE_LENGTH,
  type Message,
  sendMessage,
  type UIMessage,
} from "@/lib/messages";
import { supabase } from "@/integrations/supabase/client";
import { ProfileDetails } from "@/components/nsu/ProfileDetails";
import { ChatSafetyMenu } from "@/components/nsu/Safety";
import { ChatImage } from "@/components/nsu/ChatImage";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { uploadChatImage } from "@/lib/media";

export const Route = createFileRoute("/app/chat/$id")({
  head: () => ({
    meta: [{ title: "Chat — NSUMatch" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: Chat,
});

const GROUP_GAP_MS = 5 * 60 * 1000;
const TYPING_TIMEOUT_MS = 3500;
const TYPING_THROTTLE_MS = 2000;

const ts = (m: Message) => new Date(m.created_at).getTime();

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function formatDay(t: number) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Insert or replace a message by id, keeping chronological order. */
function upsert(list: UIMessage[], m: UIMessage) {
  const i = list.findIndex((x) => x.id === m.id);
  const next = i === -1 ? [...list, m] : list.map((x, j) => (j === i ? { ...x, ...m } : x));
  return next.sort((a, b) => ts(a) - ts(b));
}

function Chat() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const meId = me?.id ?? null;
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canMessage, setCanMessage] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [theyAreTyping, setTheyAreTyping] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);

  // Their profile
  useEffect(() => {
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) navigate({ to: "/app/matches" });
        else setProfile(data as unknown as DBProfile);
      });
  }, [id, navigate]);

  // History, match check, read receipts and live updates
  useEffect(() => {
    if (!meId) return;
    let alive = true;

    (async () => {
      const [{ messages: history, error }, { match }] = await Promise.all([
        fetchConversation(meId, id),
        isMutualMatch(meId, id),
      ]);
      if (!alive) return;
      if (error) toast.error("Couldn't load messages. Check your connection.");
      // Merge with anything that arrived (live or optimistic) while history was loading.
      setMessages((cur) => cur.reduce<UIMessage[]>((acc, m) => upsert(acc, m), history));
      setCanMessage(match);
      setLoaded(true);
      if (history.some((m) => m.to_profile_id === meId && !m.read_at)) {
        markConversationRead(meId, id);
      }
    })();

    const channel = supabase
      .channel(dmTopic(meId, id), { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `to_profile_id=eq.${meId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.from_profile_id !== id) return;
          setTheyAreTyping(false);
          setMessages((list) => upsert(list, m));
          haptic(8);
          if (document.visibilityState === "visible") markConversationRead(meId, id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `from_profile_id=eq.${meId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.to_profile_id === id) setMessages((list) => upsert(list, m));
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.from !== id) return;
        setTheyAreTyping(true);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTheyAreTyping(false), TYPING_TIMEOUT_MS);
      })
      .subscribe();
    channelRef.current = channel;

    // Mark as read when coming back to the app.
    const onVisible = () => {
      if (document.visibilityState === "visible") markConversationRead(meId, id);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(typingTimer.current);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [meId, id]);

  // Keep the newest message in view (also when the keyboard opens).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: loaded ? "smooth" : "auto" });
  }, [messages.length, theyAreTyping, loaded]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Auto-grow the composer up to ~5 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (!meId || now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
    lastTypingSent.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: meId } });
  }, [meId]);

  const markFailed = (localId: string) =>
    setMessages((list) => list.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)));

  const deliver = async (localId: string, body: string, file?: File) => {
    if (!meId || !session) return;
    let imagePath: string | undefined;
    if (file) {
      const { path, error: upErr } = await uploadChatImage(session.user.id, id, file);
      if (!path) {
        markFailed(localId);
        toast.error(upErr ?? "Couldn't upload that photo.");
        return;
      }
      imagePath = path;
    }
    const { message, error } = await sendMessage(meId, id, body, imagePath);
    if (error || !message) {
      markFailed(localId);
      if (error && /row-level security/i.test(error.message)) {
        setCanMessage(false);
        toast.error("You can only message people you've matched with.");
      }
      return;
    }
    setMessages((list) => {
      const local = list.find((m) => m.id === localId);
      // keep showing the local preview until the signed URL loads
      return upsert(
        list.filter((m) => m.id !== localId),
        { ...message, localImage: local?.localImage },
      );
    });
  };

  const addLocal = (body: string, file?: File) => {
    if (!meId) return null;
    const localId = `local-${crypto.randomUUID()}`;
    setMessages((list) => [
      ...list,
      {
        id: localId,
        from_profile_id: meId,
        to_profile_id: id,
        body,
        image_path: null,
        created_at: new Date().toISOString(),
        read_at: null,
        status: "sending",
        localImage: file ? URL.createObjectURL(file) : undefined,
        file,
      },
    ]);
    return localId;
  };

  const send = (text: string) => {
    const body = text.trim();
    if (!body || !meId || canMessage === false) return;
    haptic(8);
    const localId = addLocal(body);
    setDraft("");
    lastTypingSent.current = 0;
    inputRef.current?.focus();
    if (localId) deliver(localId, body);
  };

  const sendPhoto = (file: File | undefined) => {
    if (!file || canMessage === false) return;
    haptic(8);
    const localId = addLocal("", file);
    if (localId) deliver(localId, "", file);
  };

  const retry = (m: UIMessage) => {
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    deliver(m.id, m.body, m.file);
  };

  if (!profile) {
    return (
      <div className="h-full grid place-items-center">
        <div className="h-10 w-10 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  const starters = ICEBREAKERS.slice(0, 4);
  const lastSeenMine = [...messages].reverse().find((m) => m.from_profile_id === meId && !m.status);
  const locked = canMessage === false;

  return (
    <div className="h-full flex flex-col bg-background select-none">
      <header className="shrink-0 z-10 bg-card/90 backdrop-blur-xl border-b border-border pt-safe">
        <div className="max-w-md mx-auto flex items-center gap-2 px-2 h-14">
          <Link
            to="/app/matches"
            className="h-11 w-11 rounded-full grid place-items-center active:bg-accent"
            aria-label="Back to chats"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setDetailsOpen(true)}
            className="flex flex-1 min-w-0 items-center gap-3 text-left rounded-xl py-1 active:opacity-70"
            aria-label={`View ${profile.first_name}'s profile`}
          >
            <ProfilePhoto
              src={profile.photo_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="font-semibold leading-tight flex items-center gap-1">
                <span className="truncate">{profile.first_name}</span>
                {profile.verified && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500 fill-sky-500/15" />
                )}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {theyAreTyping ? (
                  <span className="text-primary font-medium">typing…</span>
                ) : (
                  <>
                    {profile.department} · {profile.major}
                  </>
                )}
              </p>
            </div>
          </button>
          {meId && (
            <ChatSafetyMenu
              profile={profile}
              meId={meId}
              onViewProfile={() => setDetailsOpen(true)}
              onLeave={() => navigate({ to: "/app/matches" })}
            />
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-md mx-auto px-3 py-4">
          {!loaded ? (
            <div className="space-y-3 animate-pulse pt-4">
              {[60, 40, 70, 50].map((w, i) => (
                <div
                  key={i}
                  className={`h-9 rounded-[20px] bg-muted ${i % 2 ? "ml-auto" : ""}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="pt-6 text-center">
              <ProfilePhoto
                src={profile.photo_url}
                alt=""
                className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-gold/60"
              />
              {locked ? (
                <>
                  <p className="mt-4 text-lg font-bold">You haven't matched yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You can message {profile.first_name} once you've both liked each other.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-lg font-bold">You matched with {profile.first_name}!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Break the ice with something only an NSU student would get.
                  </p>
                  <div className="mt-6 space-y-2 text-left">
                    {starters.map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          setDraft(q);
                          inputRef.current?.focus();
                        }}
                        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm active:scale-[0.98] active:bg-accent transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="mt-6 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Be kind. Never share passwords or money.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const at = ts(m);
              const newDay =
                !prev || new Date(ts(prev)).toDateString() !== new Date(at).toDateString();
              const firstOfGroup =
                !prev ||
                prev.from_profile_id !== m.from_profile_id ||
                at - ts(prev) > GROUP_GAP_MS ||
                newDay;
              const lastOfGroup =
                !next || next.from_profile_id !== m.from_profile_id || ts(next) - at > GROUP_GAP_MS;
              const mine = m.from_profile_id === meId;
              return (
                <div key={m.id}>
                  {newDay && (
                    <p className="my-4 text-center text-[11px] font-medium text-muted-foreground">
                      {formatDay(at)}
                    </p>
                  )}
                  <div
                    className={`flex items-end gap-2 animate-msg-in ${mine ? "justify-end" : "justify-start"} ${
                      firstOfGroup ? "mt-3" : "mt-0.5"
                    }`}
                  >
                    {!mine && (
                      <span className="w-7 shrink-0">
                        {lastOfGroup && (
                          <ProfilePhoto
                            src={profile.photo_url}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        )}
                      </span>
                    )}
                    {m.image_path || m.localImage ? (
                      <ChatImage
                        path={m.image_path}
                        localUrl={m.localImage}
                        caption={m.body}
                        mine={mine}
                        pending={m.status === "sending"}
                        failed={m.status === "failed"}
                      />
                    ) : (
                      <div
                        className={`max-w-[75%] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap rounded-[20px] select-text ${
                          mine
                            ? `bg-primary text-primary-foreground ${lastOfGroup ? "rounded-br-md" : ""}`
                            : `bg-muted text-foreground ${lastOfGroup ? "rounded-bl-md" : ""}`
                        } ${m.status === "sending" ? "opacity-60" : ""} ${
                          m.status === "failed" ? "opacity-60 ring-2 ring-destructive" : ""
                        }`}
                      >
                        {m.body}
                      </div>
                    )}
                  </div>
                  {m.status === "failed" ? (
                    <button
                      onClick={() => retry(m)}
                      className="mt-1 ml-auto flex items-center gap-1 text-[11px] font-medium text-destructive pr-1 h-8"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> Not sent · Tap to retry
                    </button>
                  ) : (
                    lastOfGroup && (
                      <p
                        className={`mt-1 text-[10px] text-muted-foreground ${mine ? "text-right pr-1" : "pl-10"}`}
                      >
                        {m.status === "sending"
                          ? "Sending…"
                          : mine && m.id === lastSeenMine?.id && m.read_at
                            ? `Seen ${formatTime(new Date(m.read_at).getTime())}`
                            : formatTime(at)}
                      </p>
                    )
                  )}
                </div>
              );
            })
          )}
          {theyAreTyping && (
            <div className="mt-3 flex items-end gap-2" aria-live="polite">
              <ProfilePhoto
                src={profile.photo_url}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
              />
              <div className="bg-muted rounded-[20px] rounded-bl-md px-4 py-3 flex gap-1">
                <span className="sr-only">{profile.first_name} is typing</span>
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur-xl pb-safe">
        {locked ? (
          <p className="max-w-md mx-auto flex items-center justify-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            {messages.length
              ? "This conversation is closed."
              : "Messaging unlocks when you both match."}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="max-w-md mx-auto flex items-end gap-1.5 px-2 py-2"
          >
            <label
              className={`h-11 w-11 shrink-0 rounded-full grid place-items-center text-muted-foreground active:bg-accent cursor-pointer ${
                !loaded ? "pointer-events-none opacity-50" : ""
              }`}
              aria-label="Send a photo"
            >
              <ImagePlus className="h-5 w-5" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  sendPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="h-11 w-11 shrink-0 rounded-full grid place-items-center text-gold-foreground bg-gold/90 active:scale-90 transition"
              aria-label="Suggest an NSU icebreaker"
              onClick={() => {
                setDraft(ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)]);
                inputRef.current?.focus();
              }}
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) broadcastTyping();
              }}
              onKeyDown={(e) => {
                // Enter sends on desktop; on phones the return key inserts a newline.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  window.matchMedia("(pointer: fine)").matches
                ) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder={`Message ${profile.first_name}…`}
              enterKeyHint="send"
              autoCapitalize="sentences"
              disabled={!loaded}
              className="flex-1 min-w-0 resize-none max-h-[120px] min-h-11 py-[11px] px-4 rounded-[22px] bg-muted text-[15px] leading-snug outline-none focus:ring-2 focus:ring-ring select-text disabled:opacity-60"
            />
            <button
              type="button"
              className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center transition active:scale-90 disabled:opacity-40"
              disabled={!draft.trim() || !loaded}
              aria-label="Send"
              // keep the keyboard open when tapping send on iOS
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => send(draft)}
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </form>
        )}
      </div>

      <ProfileDetails
        profile={profile}
        viewer={me}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
