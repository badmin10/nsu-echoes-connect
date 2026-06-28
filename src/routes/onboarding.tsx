import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import {
  ALL_SLOTS,
  DEPARTMENTS,
  type Department,
} from "@/lib/nsu";
import { Camera, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Get verified — NSUMatch" }] }),
  component: Onboarding,
});

const PHOTO_OPTIONS = [
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&q=80",
  "https://images.unsplash.com/photo-1545996124-0501ebae84d0?w=800&q=80",
  "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=800&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80",
];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [major, setMajor] = useState("");
  const [photo, setPhoto] = useState(PHOTO_OPTIONS[0]);
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
        photo_url: photo,
        free_slots: slots,
        id_card_uploaded: idUploaded,
        verified: idUploaded, // demo auto-verify after ID upload
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
    if (step === 1) return firstName.trim() && Number(age) >= 17 && bio.trim().length > 0;
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
              <Label>Pick a photo</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {PHOTO_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPhoto(p)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${
                      photo === p ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
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
              <img src={photo} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <div className="text-sm">
                <p className="font-semibold">
                  {firstName || "Student"}, {age || "—"}
                </p>
                <p className="text-muted-foreground">
                  {department || "—"} • {major || "—"}
                </p>
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
