import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_SLOTS, DEPARTMENTS, type Department } from "@/lib/nsu";
import { Camera, Check, ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Get verified — NSUMatch" }] }),
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
  const [idUploaded, setIdUploaded] = useState(false);
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
      const { data: signed } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) uploaded.push(signed.signedUrl);
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
        verified: idUploaded,
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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg nsu-gradient text-navy-foreground grid place-items-center font-black">
            N
          </div>
          <span className="font-semibold">NSUMatch</span>
        </div>
        <div className="mt-6 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Step {step} of 4</p>
      </header>

      <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full">
        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Your basics</h2>
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                rows={3}
                placeholder="What's your vibe on campus?"
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
                Upload {MIN_PHOTOS}–{MAX_PHOTOS} photos from your gallery. The first photo is your main one.
              </p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((p, idx) => (
                  <div
                    key={p}
                    className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                  >
                    <img src={p} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 text-white grid place-items-center"
                      aria-label="Remove photo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="aspect-square rounded-lg border-2 border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
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
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Academic info</h2>
            <div>
              <Label>Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your school" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="major">Major</Label>
              <Input
                id="major"
                placeholder="e.g., Computer Science"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
              />
            </div>
            <div>
              <Label>Free slots (optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Pick the times you usually have free between classes.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSlot(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
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
            <h2 className="text-2xl font-bold">Verify your NSU ID</h2>
            <p className="text-sm text-muted-foreground">
              For privacy, you can cover your Student ID number with your thumb. We only cross-check
              your <span className="font-medium text-foreground">Name and Photo</span>.
            </p>
            <label className="block">
              <div
                className={`aspect-[4/3] rounded-2xl border-2 border-dashed grid place-items-center cursor-pointer transition-colors ${
                  idUploaded ? "border-primary bg-primary/5" : "border-border bg-muted/40"
                }`}
              >
                {idUploaded ? (
                  <div className="text-center">
                    <Check className="mx-auto h-10 w-10 text-primary" />
                    <p className="mt-2 text-sm font-medium">ID uploaded — awaiting review</p>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Camera className="mx-auto h-10 w-10" />
                    <p className="mt-2 text-sm">Tap to upload a photo of your Student ID</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={() => setIdUploaded(true)}
                />
              </div>
            </label>
            {!idUploaded && (
              <Button variant="outline" className="w-full" onClick={() => setIdUploaded(true)}>
                Skip camera, simulate upload
              </Button>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">You're all set 🎉</h2>
            <p className="text-sm text-muted-foreground">
              We'll cross-check your ID with your profile. Once approved by an admin, you'll get the
              blue verified badge.
            </p>
            <div className="rounded-2xl border bg-card p-4 flex gap-3">
              {photos[0] && (
                <img src={photos[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />
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

      <footer className="px-6 pb-6 max-w-md mx-auto w-full flex gap-3">
        {step > 1 && (
          <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < 4 ? (
          <Button className="flex-1" disabled={!canNext()} onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            className="flex-1 bg-gold text-gold-foreground hover:bg-gold/90"
            onClick={finish}
            disabled={saving}
          >
            {saving ? "Saving…" : "Enter NSUMatch"}
          </Button>
        )}
      </footer>
    </div>
  );
}
