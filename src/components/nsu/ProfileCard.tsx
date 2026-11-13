import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { BadgeCheck, ChevronUp, GraduationCap } from "lucide-react";
import { DEPARTMENTS, LOCATIONS, type DBProfile, mutualSlots, profilePhotos } from "@/lib/nsu";

export function ProfileCard({
  profile,
  viewer,
  photoIndex = 0,
  onOpenDetails,
}: {
  profile: DBProfile;
  viewer: DBProfile | null;
  photoIndex?: number;
  onOpenDetails?: () => void;
}) {
  const photos = profilePhotos(profile);
  const idx = Math.min(photoIndex, photos.length - 1);
  const loc = LOCATIONS.find((l) => l.key === profile.location);
  const dept = DEPARTMENTS.find((d) => d.value === profile.department);
  const shared = viewer ? mutualSlots(viewer.free_slots, profile.free_slots) : [];

  return (
    <div className="relative h-full w-full rounded-[28px] overflow-hidden bg-muted shadow-[0_20px_50px_-20px_rgba(10,15,40,0.55)] ring-1 ring-black/5">
      {photos.map((src, i) => (
        <ProfilePhoto
          key={src + i}
          src={src}
          alt={i === idx ? `Photo ${i + 1} of ${profile.first_name}` : ""}
          className={`absolute inset-0 h-full w-full object-cover pointer-events-none transition-opacity duration-200 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
          draggable={false}
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
        />
      ))}

      {/* Photo progress bars, Tinder/Hinge style */}
      {photos.length > 1 && (
        <div className="absolute top-2.5 inset-x-3 flex gap-1 z-10 pointer-events-none">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === idx ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}

      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />

      <div className="absolute top-6 left-4 right-4 flex items-start justify-between gap-2 pointer-events-none">
        {loc && loc.key !== "none" ? (
          <div className="bg-black/40 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 min-w-0">
            <span aria-hidden>{loc.emoji}</span>
            <span className="truncate">{loc.label}</span>
          </div>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-[10px] uppercase tracking-wider bg-gold text-gold-foreground px-2.5 py-1 rounded-full font-bold">
          {profile.department}
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[32px] font-black leading-none tracking-tight truncate">
                {profile.first_name}
                <span className="font-semibold opacity-90">, {profile.age}</span>
              </h2>
              {profile.verified && (
                <BadgeCheck
                  className="h-7 w-7 shrink-0 text-sky-400 fill-sky-400/25"
                  aria-label="Verified NSU student"
                />
              )}
            </div>
            <p className="mt-1.5 text-sm text-white/85 flex items-center gap-1.5 truncate">
              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              {profile.major} · {dept?.label.split(" — ")[1] ?? profile.department}
            </p>
          </div>
          {onOpenDetails && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenDetails}
              className="shrink-0 h-11 w-11 rounded-full bg-white/20 backdrop-blur-md grid place-items-center active:scale-90 transition"
              aria-label={`View ${profile.first_name}'s full profile`}
            >
              <ChevronUp className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* bio on the first photo only, so later photos stay uncluttered */}
        {idx === 0 && profile.bio && (
          <p className="mt-2.5 text-[15px] leading-snug text-white/95 line-clamp-2">
            {profile.bio}
          </p>
        )}

        {shared.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold text-gold-foreground px-3 py-1.5 text-xs font-bold">
            ✨ Both free at {shared[0]}
            {shared.length > 1 && <span className="opacity-70">+{shared.length - 1}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
