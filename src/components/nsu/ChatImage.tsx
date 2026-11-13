import { useEffect, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { chatImageUrl } from "@/lib/media";

/** Photo bubble in a chat; tap to view full screen. */
export function ChatImage({
  path,
  localUrl,
  caption,
  mine,
  pending,
  failed,
}: {
  path: string | null;
  localUrl?: string;
  caption?: string;
  mine: boolean;
  pending?: boolean;
  failed?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(localUrl ?? null);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    chatImageUrl(path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else if (!localUrl) setBroken(true);
    });
    return () => {
      alive = false;
    };
  }, [path, localUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className={`relative max-w-[70%] overflow-hidden rounded-[20px] bg-muted ${
          mine ? "rounded-br-md" : "rounded-bl-md"
        } ${failed ? "ring-2 ring-destructive" : ""}`}
        aria-label="Open photo"
      >
        {broken ? (
          <div className="h-40 w-48 grid place-items-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        ) : url ? (
          <img
            src={url}
            alt="Photo in chat"
            className={`block max-h-72 w-auto min-w-32 object-cover ${pending ? "opacity-60" : ""}`}
            onError={() => setBroken(true)}
            loading="lazy"
          />
        ) : (
          <div className="h-48 w-48 animate-pulse" />
        )}
        {pending && (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-white drop-shadow" />
          </span>
        )}
        {caption && (
          <span
            className={`block px-3.5 py-2 text-left text-[15px] leading-snug ${
              mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {caption}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-dvh w-screen max-w-none border-0 bg-black p-0 sm:rounded-none [&>button]:hidden">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {/* wrapped: direct-child buttons are hidden above to remove the default close */}
          <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10">
            <button
              onClick={() => setOpen(false)}
              className="h-11 w-11 rounded-full bg-white/15 text-white grid place-items-center"
              aria-label="Close photo"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          {url && (
            <img
              src={url}
              alt="Photo in chat"
              className="h-full w-full object-contain select-none"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
