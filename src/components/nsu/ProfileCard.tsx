import { BadgeCheck } from "lucide-react";
import { LOCATIONS, type DBProfile, mutualSlots } from "@/lib/nsu";

export function ProfileCard({
  profile,
  viewer,
}: {
  profile: DBProfile;
  viewer: DBProfile | null;
}) {
  const loc = LOCATIONS.find((l) => l.key === profile.location);
  const shared = viewer ? mutualSlots(viewer.free_slots, profile.free_slots) : [];

  return (
    <div className="relative h-full w-full rounded-3xl overflow-hidden bg-card shadow-xl">
      <img
        src={profile.photo_url}
        alt={`Profile photo of ${profile.first_name}`}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

      {loc && loc.key !== "none" && (
        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
          <span>{loc.emoji}</span>
          <span className="max-w-[200px] truncate">{loc.label}</span>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
        <span className="text-[10px] uppercase tracking-wider bg-gold text-gold-foreground px-2 py-1 rounded-full font-bold">
          {profile.department} • {profile.major}
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-black leading-tight">
            {profile.first_name}, {profile.age}
          </h2>
          {profile.verified && <BadgeCheck className="h-6 w-6 text-sky-400 fill-sky-400/20" />}
        </div>
        <p className="mt-1 text-sm opacity-90 line-clamp-2">{profile.bio}</p>

        {shared.length > 0 && (
          <div className="mt-3 rounded-xl bg-gold/95 text-gold-foreground px-3 py-2 text-xs font-semibold">
            ✨ You both have a free slot at {shared[0]}!
          </div>
        )}
      </div>
    </div>
  );
}
