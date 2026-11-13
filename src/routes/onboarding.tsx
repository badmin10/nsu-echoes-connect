import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALL_SLOTS, DEPARTMENTS, type Department } from "@/lib/nsu";
import { Camera, Check, ImagePlus, Loader2, Lock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadIdCard } from "@/lib/verification";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Create your profile — NSUMatch" },
      {
        name: "description",
        content:
          "Set up your verified NSUMatch profile: photos, academic info, NSU ID verification, and free-slot preferences.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Onboarding,
});

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per photo

function Onboarding() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [major, setMajor] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [idPath, setIdPath] = useState<string | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const idUploaded = !!idPath;

  const handleIdFile = async (file: File | undefined) => {
    if (!file || !userId) return;
    setIdError(null);
    setIdUploading(true);
    if (idPreview) URL.revokeObjectURL(idPreview);
    setIdPreview(URL.createObjectURL(file));
    const { path, error: upErr } = await uploadIdCard(userId, file);
    setIdUploading(false);
    if (upErr || !path) {
      setIdError(upErr ?? "Upload failed. Try again.");
      setIdPath(null);
      return;
    }
    setIdPath(path);
  };
  const [slots, setSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(data.session.user.id);
    });
  }, [navigate]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !userId) return;
    setPhotoError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setPhotoError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        setPhotoError("Only image files are allowed.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setPhotoError("Each photo must be 8 MB or less.");
        continue;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("profile-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setPhotoError(upErr.message);
        continue;
      }
      uploaded.push(path);
    }
    setPhotos((p) => [...p, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (url: string) => setPhotos((p) => p.filter((u) => u !== url));

  const finish = async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || "Student",
        age: Number(age) || 18,
        bio: bio.trim() || "New on NSUMatch.",
        department: department || "SBE",
        major: major.trim() || "Undeclared",
        photo_url: photos[0],
        photos,
        free_slots: slots,
        id_card_uploaded: idUploaded,
        id_card_path: idPath,
        // Goes into the admin review queue. The blue badge is granted only by an admin
        // (enforced in the database), never on upload.
        verification_status: idUploaded ? "pending" : "none",
        onboarding_complete: true,
      })
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/app" });
  };

  const canNext = () => {
    if (step === 1)
      return (
        firstName.trim() &&
        Number(age) >= 17 &&
        bio.trim().length > 0 &&
        photos.length >= MIN_PHOTOS
      );
    if (step === 2) return department && major.trim().length > 0;
    if (step === 3) return idUploaded;
    return true;
  };

  const toggleSlot = (s: string) =>
    setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="min-h-app bg-background flex flex-col pt-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl px-5 pt-4 pb-3 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg nsu-gradient text-navy-foreground grid place-items-center font-black">
              N
            </div>
            <span className="font-semibold">NSUMatch</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground">Step {step} of 4</span>
        </div>
        <div
          className="mt-4 flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={step}
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full bg-primary transition-all duration-500 ${i <= step ? "w-full" : "w-0"}`}
              />
            </div>
          ))}
        </div>
      </header>

      <main key={step} className="flex-1 px-5 py-4 max-w-md mx-auto w-full animate-msg-in">
        {step === 1 && (
          <section className="space-y-5">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Let's make your profile</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Great photos and a real bio get way more matches.
              </p>
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  className="h-12 rounded-xl"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  enterKeyHint="next"
                  className="h-12 rounded-xl"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            {age !== "" && Number(age) < 17 && (
              <p className="-mt-3 text-xs text-destructive">You must be 17 or older.</p>
            )}
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="bio">Short bio</Label>
                <span className="text-xs text-muted-foreground">{bio.length}/300</span>
              </div>
              <Textarea
                id="bio"
                rows={3}
                maxLength={300}
                className="rounded-xl"
                placeholder="e.g. CSE junior, library 3rd floor regular, will trade notes for fuchka."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label>
                  Your photos <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {photos.length}/{MAX_PHOTOS} · min {MIN_PHOTOS}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Upload {MIN_PHOTOS}–{MAX_PHOTOS} photos from your gallery. The first photo is your
                main one.
              </p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((p, idx) => (
                  <div
                    key={p}
                    className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted"
                  >
                    <ProfilePhoto
                      src={p}
                      alt={`Your gallery photo ${idx + 1} of ${photos.length}`}
                      className="h-full w-full object-cover"
                    />
                    {idx === 0 ? (
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold bg-gold text-gold-foreground px-2 py-0.5 rounded-full">
                        Main
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPhotos((list) => [p, ...list.filter((u) => u !== p)])}
                        className="absolute bottom-1 left-1 h-8 px-2 rounded-full bg-black/60 text-white text-[10px] font-semibold"
                        aria-label="Make this your main photo"
                      >
                        Set main
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      className="absolute top-1 right-1 h-8 w-8 rounded-full bg-black/60 text-white grid place-items-center active:scale-90"
                      aria-label="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="aspect-[3/4] rounded-2xl border-2 border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
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
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {photoError && <p className="mt-2 text-xs text-destructive">{photoError}</p>}
              {photos.length < MIN_PHOTOS && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add at least {MIN_PHOTOS - photos.length} more photo
                  {MIN_PHOTOS - photos.length === 1 ? "" : "s"} to continue.
                </p>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Campus life</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Helps you find people you actually cross paths with.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Your school</Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {DEPARTMENTS.map((d) => {
                  const on = department === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setDepartment(d.value)}
                      className={`rounded-2xl border p-3 text-left transition active:scale-[0.97] ${
                        on
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="block font-black">{d.short}</span>
                      <span className="block text-[11px] leading-tight text-muted-foreground mt-0.5">
                        {d.label.split(" — ")[1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="major">Major</Label>
              <Input
                id="major"
                autoCapitalize="words"
                enterKeyHint="done"
                className="h-12 rounded-xl"
                placeholder="e.g., Computer Science"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
              />
            </div>
            <div>
              <Label>Free slots (optional)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Pick the times you usually have free between classes.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={slots.includes(s)}
                    onClick={() => toggleSlot(s)}
                    className={`h-10 text-sm px-4 rounded-full border transition active:scale-95 ${
                      slots.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h1 className="text-3xl font-black tracking-tight">Verify your NSU ID</h1>
            <p className="text-sm text-muted-foreground">
              For privacy, you can cover your Student ID number with your thumb. We only cross-check
              your <span className="font-medium text-foreground">Name and Photo</span>.
            </p>
            <div
              className={`relative aspect-[4/3] rounded-2xl border-2 border-dashed overflow-hidden grid place-items-center transition-colors ${
                idUploaded ? "border-primary bg-primary/5" : "border-border bg-muted/40"
              }`}
            >
              {idPreview ? (
                <img
                  src={idPreview}
                  alt="Your student ID"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="text-center text-muted-foreground px-6">
                  <Camera className="mx-auto h-10 w-10" />
                  <p className="mt-2 text-sm">
                    Take a clear photo of the front of your NSU ID card
                  </p>
                </div>
              )}
              {idUploading && (
                <div className="absolute inset-0 bg-background/70 grid place-items-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              {idUploaded && !idUploading && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold">
                  <Check className="h-3.5 w-3.5" /> Uploaded securely
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="h-12 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
                <Camera className="h-4 w-4" /> {idPreview ? "Retake" : "Take photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={idUploading}
                  onChange={(e) => {
                    handleIdFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="h-12 rounded-full border border-border bg-card font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
                <ImagePlus className="h-4 w-4" /> From gallery
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={idUploading}
                  onChange={(e) => {
                    handleIdFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {idError && <p className="text-sm text-destructive">{idError}</p>}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Your ID is stored privately. Only NSUMatch admins can see it, and only to verify you.
            </p>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <h1 className="text-3xl font-black tracking-tight">You're all set 🎉</h1>
            <p className="text-sm text-muted-foreground">
              We'll cross-check your ID with your profile. Once approved by an admin, you'll get the
              blue verified badge.
            </p>
            <div className="rounded-2xl border bg-card p-4 flex gap-3">
              {photos[0] && (
                <ProfilePhoto
                  src={photos[0]}
                  alt="Your main profile photo preview"
                  className="h-16 w-16 rounded-xl object-cover"
                />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {firstName || "Student"}, {age || "—"}
                </p>
                <p className="text-muted-foreground">
                  {department || "—"} • {major || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{photos.length} photos</p>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 z-10 bg-background/90 backdrop-blur-xl border-t border-border">
        <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] max-w-md mx-auto w-full flex gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              className="h-12 rounded-full flex-1"
              onClick={() => {
                setStep(step - 1);
                window.scrollTo({ top: 0 });
              }}
            >
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              className="h-12 rounded-full flex-[2] font-semibold"
              disabled={!canNext()}
              onClick={() => {
                setStep(step + 1);
                window.scrollTo({ top: 0 });
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              className="h-12 rounded-full flex-[2] font-semibold bg-gold text-gold-foreground hover:bg-gold/90 gold-glow"
              onClick={finish}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Enter NSUMatch"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
