import { useEffect, useState } from "react";
import { Ban, Bell, BellOff, Loader2, Share } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { fetchMyBlocks, unblockProfile } from "@/lib/safety";

/** Push notification switch, with Add-to-Home-Screen guidance on iPhone. */
export function NotificationSetting() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    if (on) {
      const { ok, error } = await enablePush();
      if (!ok) toast.error(error ?? "Couldn't turn on notifications.");
      else toast.success("Notifications on 🔔");
    } else {
      await disablePush();
      toast("Notifications off");
    }
    setState(await getPushState());
    setBusy(false);
  };

  if (state === null) return null;

  return (
    <div className="rounded-2xl border border-border">
      <label className="flex items-center justify-between gap-3 px-4 min-h-14 cursor-pointer">
        <span className="flex items-center gap-2 text-sm">
          {state === "enabled" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          Push notifications
          <span className="sr-only">for new matches and messages</span>
        </span>
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={state === "enabled"}
            disabled={state === "unsupported" || state === "needs-install" || state === "denied"}
            onCheckedChange={toggle}
          />
        )}
      </label>
      {state === "needs-install" && (
        <p className="px-4 pb-3 text-xs text-muted-foreground flex items-start gap-1.5">
          <Share className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          On iPhone: tap Share → “Add to Home Screen”, open NSUMatch from your Home Screen, then
          turn this on.
        </p>
      )}
      {state === "denied" && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser or phone settings.
        </p>
      )}
      {state === "unsupported" && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          This browser doesn't support notifications.
        </p>
      )}
      {state !== "enabled" &&
        state !== "needs-install" &&
        state !== "denied" &&
        state !== "unsupported" && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            Get notified about new matches and messages.
          </p>
        )}
    </div>
  );
}

/** Blocked accounts, with unblock. */
export function BlockedList({ meId }: { meId: string }) {
  const [blocks, setBlocks] = useState<{ id: string; created_at: string }[] | null>(null);

  useEffect(() => {
    fetchMyBlocks(meId).then(setBlocks);
  }, [meId]);

  const unblock = async (id: string) => {
    const { error } = await unblockProfile(id);
    if (error) return toast.error("Couldn't unblock. Try again.");
    setBlocks((b) => b?.filter((x) => x.id !== id) ?? null);
    toast("Unblocked. You may see each other in Discover again.");
  };

  if (!blocks?.length) return null;

  return (
    <div className="rounded-2xl border border-border divide-y divide-border">
      <p className="px-4 py-3 text-sm font-medium flex items-center gap-2">
        <Ban className="h-4 w-4" /> Blocked accounts ({blocks.length})
      </p>
      {blocks.map((b, i) => (
        <div key={b.id} className="flex items-center justify-between gap-3 px-4 min-h-14">
          <span className="text-sm text-muted-foreground">
            Blocked account {i + 1} ·{" "}
            {new Date(b.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
          <button
            onClick={() => unblock(b.id)}
            className="h-9 px-4 rounded-full border border-border text-sm font-medium active:bg-accent"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}
