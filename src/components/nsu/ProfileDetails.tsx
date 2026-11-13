import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { BadgeCheck, Clock, Flag, GraduationCap, Heart, MapPin, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DEPARTMENTS, LOCATIONS, type DBProfile, profilePhotos } from "@/lib/nsu";

/** Full-profile bottom sheet (Hinge/Bumble style: scroll through photos + details). */
export function ProfileDetails({
  profile,
  viewer,
  open,
  onOpenChange,
  onPass,
  onLike,
  onReport,
}: {
  profile: DBProfile | null;
  viewer: DBProfile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPass?: () => void;
  onLike?: () => void;
  /** Shows a "Report or block" link at the end of the profile. */
  onReport?: () => void;
}) {
  if (!profile) return null;
  const photos = profilePhotos(profile);
  const loc = LOCATIONS.find((l) => l.key === profile.location);
  const dept = DEPARTMENTS.find((d) => d.value === profile.department);
  const mine = new Set(viewer?.free_slots ?? []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-[28px] p-0 overflow-hidden flex flex-col gap-0 border-0"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30 shrink-0" />
        <div className="flex-1 overflow-y-auto overscroll-contain pb-32">
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-3xl font-black tracking-tight">
                {profile.first_name}, {profile.age}
              </SheetTitle>
              {profile.verified && <BadgeCheck className="h-6 w-6 text-sky-500 fill-sky-500/15" />}
            </div>
            <SheetDescription className="mt-1 flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" /> {profile.major} ·{" "}
              {dept?.label ?? profile.department}
            </SheetDescription>
          </div>

          <div className="space-y-3 px-3">
            {photos.map((src, i) => (
              <div key={src + i}>
                <ProfilePhoto
                  src={src}
                  alt={`Photo ${i + 1} of ${profile.first_name}`}
                  className="w-full aspect-[4/5] object-cover rounded-3xl bg-muted"
                  loading={i === 0 ? "eager" : "lazy"}
                />
                {i === 0 && profile.bio && (
                  <section className="my-3 rounded-3xl bg-muted/60 p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      About me
                    </h3>
                    <p className="mt-2 text-xl font-semibold leading-snug">{profile.bio}</p>
                  </section>
                )}
                {i === 0 && (
                  <section className="my-3 rounded-3xl bg-muted/60 p-5 space-y-3">
                    {loc && loc.key !== "none" && (
                      <p className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        Right now: {loc.emoji} {loc.label}
                      </p>
                    )}
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-muted-foreground" /> Free slots
                      </p>
                      {profile.free_slots.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {profile.free_slots.map((s) => (
                            <span
                              key={s}
                              className={`text-xs px-2.5 py-1 rounded-full border ${
                                mine.has(s)
                                  ? "bg-gold text-gold-foreground border-gold font-semibold"
                                  : "bg-card border-border"
                              }`}
                            >
                              {mine.has(s) && "✨ "}
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Hasn't added any yet.</p>
                      )}
                    </div>
                  </section>
                )}
              </div>
            ))}
          </div>
          {onReport && (
            <div className="px-5 pt-6 text-center">
              <button
                onClick={onReport}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-destructive active:bg-destructive/10"
              >
                <Flag className="h-4 w-4" /> Report or block {profile.first_name}
              </button>
            </div>
          )}
        </div>

        {(onPass || onLike) && (
          <div className="absolute inset-x-0 bottom-0 pb-safe bg-gradient-to-t from-background via-background/95 to-transparent pt-8">
            <div className="flex justify-center gap-6 pb-4">
              {onPass && (
                <button
                  onClick={onPass}
                  className="h-16 w-16 rounded-full bg-card shadow-lg ring-1 ring-border grid place-items-center text-rose-500 active:scale-90 transition"
                  aria-label={`Pass on ${profile.first_name}`}
                >
                  <X className="h-8 w-8" strokeWidth={2.75} />
                </button>
              )}
              {onLike && (
                <button
                  onClick={onLike}
                  className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg grid place-items-center text-white active:scale-90 transition"
                  aria-label={`Like ${profile.first_name}`}
                >
                  <Heart className="h-8 w-8 fill-current" />
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
