import { useState } from "react";
import { Ban, Flag, HeartOff, Loader2, MoreVertical, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { haptic, type DBProfile } from "@/lib/nsu";
import {
  blockProfile,
  REPORT_REASONS,
  reportProfile,
  type ReportReason,
  unmatch,
} from "@/lib/safety";

type Confirm = "unmatch" | "block" | null;

/** Bottom sheet to report someone (optionally blocking them in the same step). */
export function ReportSheet({
  profile,
  meId,
  open,
  onOpenChange,
  onDone,
}: {
  profile: Pick<DBProfile, "id" | "first_name">;
  meId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: (blocked: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    const { error } = await reportProfile(meId, profile.id, reason, details);
    if (!error && alsoBlock) await blockProfile(profile.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't send the report. Try again.");
      return;
    }
    haptic(15);
    toast.success("Thanks for reporting. Our team will review it.", {
      description: alsoBlock
        ? `${profile.first_name} is blocked and can't contact you.`
        : undefined,
    });
    setReason(null);
    setDetails("");
    onOpenChange(false);
    onDone?.(alsoBlock);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] max-h-[90dvh] p-0 flex flex-col gap-0 border-0"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30 shrink-0" />
        <div className="px-5 pt-3 pb-2">
          <SheetTitle className="text-xl font-black">Report {profile.first_name}</SheetTitle>
          <SheetDescription>
            Reports are anonymous. {profile.first_name} won't know it was you.
          </SheetDescription>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-2 space-y-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              aria-pressed={reason === r.value}
              className={`w-full min-h-12 rounded-2xl border px-4 py-3 text-left text-sm transition active:scale-[0.99] ${
                reason === r.value
                  ? "border-destructive bg-destructive/10 font-semibold"
                  : "border-border bg-card"
              }`}
            >
              {r.label}
            </button>
          ))}
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Anything else we should know? (optional)"
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 min-h-14 cursor-pointer">
            <span className="text-sm">
              Also block {profile.first_name}
              <span className="block text-xs text-muted-foreground">
                You'll disappear from each other's app.
              </span>
            </span>
            <Switch checked={alsoBlock} onCheckedChange={setAlsoBlock} />
          </label>
        </div>
        <div className="shrink-0 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-border">
          <Button
            className="w-full h-12 rounded-full font-semibold"
            variant="destructive"
            disabled={!reason || busy}
            onClick={submit}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "⋮" menu in a chat: view profile, unmatch, block, report. */
export function ChatSafetyMenu({
  profile,
  meId,
  onViewProfile,
  onLeave,
}: {
  profile: Pick<DBProfile, "id" | "first_name">;
  meId: string;
  onViewProfile: () => void;
  /** Called after unmatch/block — the conversation is closed. */
  onLeave: () => void;
}) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    const { error } =
      confirm === "unmatch" ? await unmatch(profile.id) : await blockProfile(profile.id);
    setBusy(false);
    setConfirm(null);
    if (error) {
      toast.error("Something went wrong. Try again.");
      return;
    }
    haptic(15);
    toast(
      confirm === "unmatch"
        ? `You unmatched with ${profile.first_name}.`
        : `${profile.first_name} is blocked.`,
    );
    onLeave();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-11 w-11 rounded-full grid place-items-center active:bg-accent"
            aria-label="More options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
          <DropdownMenuItem className="h-11 rounded-xl gap-3" onSelect={onViewProfile}>
            <UserRound className="h-4 w-4" /> View profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="h-11 rounded-xl gap-3"
            onSelect={() => setConfirm("unmatch")}
          >
            <HeartOff className="h-4 w-4" /> Unmatch
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-11 rounded-xl gap-3 text-destructive focus:text-destructive"
            onSelect={() => setConfirm("block")}
          >
            <Ban className="h-4 w-4" /> Block
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-11 rounded-xl gap-3 text-destructive focus:text-destructive"
            onSelect={() => setReportOpen(true)}
          >
            <Flag className="h-4 w-4" /> Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "unmatch"
                ? `Unmatch with ${profile.first_name}?`
                : `Block ${profile.first_name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "unmatch"
                ? "This closes your chat and removes the match for both of you. You can't undo this."
                : "They won't be able to see your profile or message you, and you won't see theirs. You can unblock later from your profile settings."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11 rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-full bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirm === "unmatch" ? "Unmatch" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportSheet
        profile={profile}
        meId={meId}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onDone={(blocked) => blocked && onLeave()}
      />
    </>
  );
}
