import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { DBProfile } from "@/lib/nsu";

/** Full-screen "It's a match" moment — the emotional peak of any dating app. */
export function MatchCelebration({
  me,
  them,
  open,
  onClose,
  onMessage,
}: {
  me: DBProfile | null;
  them: DBProfile | null;
  open: boolean;
  onClose: () => void;
  onMessage: () => void;
}) {
  if (!me || !them) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-dvh max-w-none w-screen sm:h-auto sm:max-w-sm sm:rounded-3xl border-0 nsu-gradient text-navy-foreground p-0 [&>button]:text-white [&>button]:top-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex h-full flex-col items-center justify-center px-8 pt-safe pb-safe text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold animate-pop">
            NSUMatch
          </p>
          <DialogTitle className="mt-2 text-5xl font-black italic tracking-tight animate-pop">
            It's a match!
          </DialogTitle>
          <DialogDescription className="mt-3 text-white/80">
            You and {them.first_name} liked each other.
          </DialogDescription>

          <div className="relative mt-10 h-40 w-64">
            <ProfilePhoto
              src={me.photo_url}
              alt="You"
              className="absolute left-2 top-0 h-36 w-28 rounded-3xl object-cover ring-4 ring-white -rotate-8 shadow-2xl animate-pop"
            />
            <ProfilePhoto
              src={them.photo_url}
              alt={them.first_name}
              className="absolute right-2 top-2 h-36 w-28 rounded-3xl object-cover ring-4 ring-gold rotate-8 shadow-2xl animate-pop [animation-delay:120ms]"
            />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-gold text-2xl grid place-items-center shadow-xl animate-float">
              💛
            </span>
          </div>

          <div className="mt-12 w-full space-y-3">
            <button
              onClick={onMessage}
              className="w-full h-14 rounded-full bg-gold text-gold-foreground font-bold text-base flex items-center justify-center gap-2 gold-glow active:scale-[0.98] transition"
            >
              <MessageCircle className="h-5 w-5" /> Send a message
            </button>
            <button
              onClick={onClose}
              className="w-full h-14 rounded-full bg-white/10 border border-white/25 font-semibold active:scale-[0.98] transition"
            >
              Keep swiping
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
