import { useState } from "react";
import {
  BadgeCheck,
  Camera,
  Clock,
  ImagePlus,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { DBProfile } from "@/lib/nsu";
import { submitForReview, uploadIdCard } from "@/lib/verification";

/** Shows where the user is in ID verification and lets them (re)submit an ID. */
export function VerificationCard({
  profile,
  userId,
  onSubmitted,
}: {
  profile: DBProfile;
  userId: string;
  onSubmitted: (patch: Partial<DBProfile>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const status = profile.verified ? "approved" : profile.verification_status;

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const { path, error } = await uploadIdCard(userId, file);
    if (error || !path) {
      setBusy(false);
      toast.error(error ?? "Upload failed. Try again.");
      return;
    }
    const { error: subErr } = await submitForReview(profile.id, path);
    setBusy(false);
    if (subErr) {
      toast.error("Couldn't submit for review. Try again.");
      return;
    }
    onSubmitted({ id_card_path: path, id_card_uploaded: true, verification_status: "pending" });
    toast.success("ID submitted — we'll review it soon.");
  };

  const pickers = (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <label className="h-11 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Take
        photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <label className="h-11 rounded-full border border-border bg-card font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
        <ImagePlus className="h-4 w-4" /> Gallery
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );

  if (status === "approved") {
    return (
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-center gap-3">
        <BadgeCheck className="h-8 w-8 text-sky-500 shrink-0" />
        <div>
          <p className="font-semibold">You're verified</p>
          <p className="text-xs text-muted-foreground">The blue badge shows on your card.</p>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 flex items-center gap-3">
        <Clock className="h-8 w-8 text-gold-foreground dark:text-gold shrink-0" />
        <div>
          <p className="font-semibold">ID under review</p>
          <p className="text-xs text-muted-foreground">
            An admin will check your name and photo. You'll get the badge once approved.
          </p>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-8 w-8 text-destructive shrink-0" />
          <div>
            <p className="font-semibold">Verification wasn't approved</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {profile.verification_note ? `Reason: ${profile.verification_note}. ` : ""}
              Please upload a clearer photo of your NSU ID.
            </p>
          </div>
        </div>
        {pickers}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
        <div>
          <p className="font-semibold">Get the blue badge</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified profiles get more likes. Upload your NSU ID — you can cover the ID number.
          </p>
        </div>
      </div>
      {pickers}
    </div>
  );
}
