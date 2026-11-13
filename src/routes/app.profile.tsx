import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  Check,
  Eye,
  ImagePlus,
  Loader2,
  LogOut,
  Moon,
  Pencil,
  Star,
  Sun,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_SLOTS,
  DEPARTMENTS,
  LOCATIONS,
  type DBProfile,
  type Department,
  type LocationKey,
  profileCompleteness,
  profilePhotos,
} from "@/lib/nsu";
import { useMyProfile, useSession, useTheme } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";
import { ProfileDetails } from "@/components/nsu/ProfileDetails";
import { SplashLoader } from "@/components/nsu/SplashLoader";
import { VerificationCard } from "@/components/nsu/VerificationCard";
import { BlockedList, NotificationSetting } from "@/components/nsu/SettingsExtras";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — NSUMatch" },
      {
        name: "description",
        content:
          "Manage your NSUMatch profile: campus check-in, free slots, Ghost Mode privacy, and dark theme.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProfilePage,
});

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;
const MAX_BYTES = 8 * 1024 * 1024;

function ProfilePage() {
  const { session } = useSession();
  const { profile, setProfile, error: profileError, refetch } = useMyProfile(session);
  const navigate = useNavigate();
  const { dark, setDark } = useTheme();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (profileError)
    return (
      <div role="alert" className="max-w-md mx-auto p-6 text-center">
        <p>{profileError}</p>
        <Button className="mt-4" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  if (!profile) return <SplashLoader label="Loading your profile…" />;

  /** Optimistic update: UI changes instantly, rolls back if the save fails. */
  const update = async (patch: Partial<DBProfile>) => {
    const before = profile;
    setProfile({ ...profile, ...patch });
    const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
    if (error) {
      setProfile(before);
      toast.error("Couldn't save. Check your connection and try again.");
      return false;
    }
    return true;
  };

  const photos = profilePhotos(profile);
  const { score, missing } = profileCompleteness(profile);

  const setPhotos = (next: string[]) => update({ photos: next, photo_url: next[0] });

  const addPhotos = async (files: FileList | null) => {
    if (!files || !session) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    setUploading(true);
    const added: string[] = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
        toast.error("Photos must be images under 8 MB.");
        continue;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("profile-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error(error.message);
        continue;
      }
      added.push(path);
    }
    if (added.length) {
      if (await setPhotos([...photos, ...added]))
        toast.success(added.length === 1 ? "Photo added" : `${added.length} photos added`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (url: string) => {
    if (photos.length <= MIN_PHOTOS) {
      toast(`Keep at least ${MIN_PHOTOS} photos on your profile.`);
      return;
    }
    setPhotos(photos.filter((p) => p !== url));
  };
  const makeMain = (url: string) => setPhotos([url, ...photos.filter((p) => p !== url)]);

  const toggleSlot = (s: string) => {
    const has = profile.free_slots.includes(s);
    update({
      free_slots: has ? profile.free_slots.filter((x) => x !== s) : [...profile.free_slots, s],
    });
  };

  const toggleGhost = (d: Department) => {
    const has = profile.ghost_from_depts.includes(d);
    update({
      ghost_from_depts: has
        ? profile.ghost_from_depts.filter((x) => x !== d)
        : [...profile.ghost_from_depts, d],
    });
  };

  const saveBio = async () => {
    const v = bioDraft.trim();
    if (!v) return toast("Your bio can't be empty.");
    if (await update({ bio: v })) {
      setEditingBio(false);
      toast.success("Bio updated");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-safe pb-8">
      <header className="pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-[28px] font-black tracking-tight">Profile</h1>
        <Button
          variant="outline"
          className="h-10 rounded-full"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="h-4 w-4" /> Preview
        </Button>
      </header>

      {/* Identity card */}
      <section className="mt-2 rounded-3xl nsu-gradient text-navy-foreground p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <ProfilePhoto
              src={profile.photo_url}
              alt="Your main photo"
              className="h-20 w-20 rounded-full object-cover ring-4 ring-white/20"
            />
            <svg
              className="absolute -inset-1.5 h-[92px] w-[92px] -rotate-90"
              viewBox="0 0 100 100"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="5"
              />
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 295} 295`}
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-black truncate">
                {profile.first_name}, {profile.age}
              </h2>
              {profile.verified && <BadgeCheck className="h-5 w-5 text-sky-300 shrink-0" />}
            </div>
            <p className="text-xs text-white/75 truncate">
              {profile.department} · {profile.major}
            </p>
            <p className="text-xs text-white/60 truncate">{profile.email}</p>
            {!profile.verified && (
              <p className="mt-1 text-[11px] text-gold font-medium">
                {profile.verification_status === "pending"
                  ? "ID under review"
                  : profile.verification_status === "rejected"
                    ? "Verification needs a new photo"
                    : "Not verified yet"}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Profile strength</span>
            <span className="font-black text-gold">{score}%</span>
          </div>
          {missing.length > 0 ? (
            <p className="mt-1 text-xs text-white/75">Next: {missing.slice(0, 2).join(" · ")}</p>
          ) : (
            <p className="mt-1 text-xs text-white/75">Looking great — you're all set ✨</p>
          )}
        </div>
      </section>

      {/* Verification */}
      {session && (
        <Section title="Verification">
          <VerificationCard
            profile={profile}
            userId={session.user.id}
            onSubmitted={(patch) => setProfile({ ...profile, ...patch })}
          />
        </Section>
      )}

      {/* Photos */}
      <Section
        title="Photos"
        hint={`${photos.length}/${MAX_PHOTOS} · tap ★ to set your main photo`}
      >
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p + i} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
              <ProfilePhoto
                src={p}
                alt={`Your photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
              {i === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold bg-gold text-gold-foreground px-2 py-0.5 rounded-full">
                  Main
                </span>
              ) : (
                <button
                  onClick={() => makeMain(p)}
                  className="absolute bottom-1 left-1 h-8 w-8 rounded-full bg-black/55 text-white grid place-items-center active:scale-90"
                  aria-label="Make main photo"
                >
                  <Star className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => removePhoto(p)}
                className="absolute top-1 right-1 h-8 w-8 rounded-full bg-black/55 text-white grid place-items-center active:scale-90"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="aspect-[3/4] rounded-2xl border-2 border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground active:scale-95 transition disabled:opacity-60"
              aria-label="Add photos"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6" />
              )}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addPhotos(e.target.files)}
        />
      </Section>

      {/* Bio */}
      <Section
        title="About me"
        action={
          !editingBio && (
            <button
              onClick={() => {
                setBioDraft(profile.bio);
                setEditingBio(true);
              }}
              className="h-9 px-3 rounded-full text-sm font-medium text-primary active:bg-accent flex items-center gap-1"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )
        }
      >
        {editingBio ? (
          <div className="space-y-2">
            <Textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, 300))}
              rows={4}
              autoFocus
              className="rounded-xl"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{bioDraft.length}/300</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="h-10 rounded-full"
                  onClick={() => setEditingBio(false)}
                >
                  Cancel
                </Button>
                <Button className="h-10 rounded-full" onClick={saveBio}>
                  <Check className="h-4 w-4" /> Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed">{profile.bio}</p>
        )}
      </Section>

      {/* Location check-in */}
      <Section title="📍 Meet me at…" hint="Shown on your card so people nearby can say hi.">
        <div className="grid grid-cols-2 gap-2">
          {LOCATIONS.map((l) => {
            const on = profile.location === l.key;
            return (
              <button
                key={l.key}
                onClick={() => update({ location: l.key as LocationKey })}
                aria-pressed={on}
                className={`min-h-14 rounded-2xl border px-3 py-2 text-left text-sm transition active:scale-[0.97] ${
                  on ? "border-primary bg-primary/10 font-semibold" : "border-border bg-card"
                }`}
              >
                <span className="mr-1.5">{l.emoji}</span>
                {l.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Free slots */}
      <Section title="🕒 Free slots" hint="We highlight mutual slots on your matches' cards.">
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map((s) => {
            const on = profile.free_slots.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSlot(s)}
                aria-pressed={on}
                className={`h-10 text-sm px-4 rounded-full border transition active:scale-95 ${
                  on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Ghost mode */}
      <Section
        title="👻 Ghost Mode"
        hint="Hide your profile from selected schools (e.g., your own, or cousins on campus)."
      >
        <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {DEPARTMENTS.map((d) => {
            const on = profile.ghost_from_depts.includes(d.value);
            return (
              <label
                key={d.value}
                className="flex items-center justify-between gap-3 px-4 min-h-14 cursor-pointer"
              >
                <span className="text-sm">{d.label}</span>
                <Switch checked={on} onCheckedChange={() => toggleGhost(d.value)} />
              </label>
            );
          })}
        </div>
      </Section>

      {/* Settings */}
      <Section title="Settings">
        <div className="space-y-3">
          <NotificationSetting />
          <label className="flex items-center justify-between rounded-2xl border border-border px-4 min-h-14 cursor-pointer">
            <span className="flex items-center gap-2 text-sm">
              {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Dark mode
            </span>
            <Switch checked={dark} onCheckedChange={setDark} />
          </label>
          <BlockedList meId={profile.id} />
        </div>
      </Section>

      <Button
        variant="outline"
        className="mt-6 w-full h-12 rounded-full text-destructive"
        onClick={logout}
      >
        <LogOut className="h-4 w-4" /> Sign out
      </Button>

      <ProfileDetails
        profile={profile}
        viewer={profile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
