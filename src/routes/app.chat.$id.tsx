import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Send, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICEBREAKERS, type DBProfile } from "@/lib/nsu";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/chat/$id")({
  head: () => ({ meta: [{ title: "Chat — NSUMatch" }] }),
  component: Chat,
});

type Msg = { from: "me" | "them"; text: string; at: number };
const LS_PREFIX = "nsumatch:chat:";

function Chat() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) navigate({ to: "/app/matches" });
        else setProfile(data as DBProfile);
      });
  }, [id, navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + id);
      setMessages(raw ? (JSON.parse(raw) as Msg[]) : []);
    } catch {
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PREFIX + id, JSON.stringify(messages));
    } catch {
      // ignore
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, id]);

  // Block screenshots (best-effort visual guardrail)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        alert("Screenshots are disabled in NSUMatch chats to protect privacy.");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (!profile) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { from: "me", text: trimmed, at: Date.now() }]);
    setDraft("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          from: "them",
          text: "haha, only an NSU student would ask that 😄",
          at: Date.now(),
        },
      ]);
    }, 1200);
  };

  const generateIcebreaker = () =>
    setDraft(ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)]);

  return (
    <div className="flex flex-col h-screen pb-20 select-none">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-3 py-2 flex items-center gap-3">
        <Link
          to="/app/matches"
          className="h-9 w-9 rounded-full grid place-items-center hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <img src={profile.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold leading-tight">{profile.first_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {profile.department} • {profile.major}
          </p>
        </div>
      </header>

      <div className="px-3 py-2 bg-muted/60 text-[11px] text-muted-foreground flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5" />
        Screenshots are blocked in NSUMatch chats. Keep things kind.
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground mt-10">
            Say hi to {profile.first_name}. Try an NSU icebreaker 👇
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm ${
              m.from === "me"
                ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                : "mr-auto bg-muted text-foreground rounded-bl-sm"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="px-3 pt-2 pb-3 border-t border-border bg-card space-y-2">
        <Button variant="outline" size="sm" onClick={generateIcebreaker} className="text-xs">
          <Sparkles className="h-3.5 w-3.5" /> NSU icebreaker
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            className="h-10 w-10 rounded-full grid place-items-center text-muted-foreground hover:bg-accent"
            aria-label="Attach media"
            onClick={() => alert("Media attachments coming soon.")}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${profile.first_name}`}
            className="flex-1 h-10 px-4 rounded-full bg-muted text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"
            disabled={!draft.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
