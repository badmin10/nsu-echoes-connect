import { useMotionValue, useTransform, motion, type PanInfo } from "motion/react";
import { useState } from "react";
import { Heart, X } from "lucide-react";
import type { DBProfile } from "@/lib/nsu";
import { ProfileCard } from "./ProfileCard";

type Props = {
  profile: DBProfile;
  viewer: DBProfile | null;
  onSwipe: (dir: "left" | "right") => void;
  isTop: boolean;
  depth: number;
};

export function SwipeCard({ profile, viewer, onSwipe, isTop, depth }: Props) {
  // Use plain DOM API fallback if motion is unavailable — but motion ships with TanStack template? Check.
  // Implement with pointer events directly (no motion dep).
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [released, setReleased] = useState<null | "left" | "right">(null);

  if (!isTop) {
    return (
      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.04})`,
          pointerEvents: "none",
        }}
      >
        <ProfileCard profile={profile} viewer={viewer} />
      </div>
    );
  }

  const threshold = 110;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, dragging: true });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.dragging) return;
    setDrag((d) => ({ ...d, x: d.x + e.movementX, y: d.y + e.movementY }));
  };
  const finish = (dir: "left" | "right") => {
    setReleased(dir);
    setTimeout(() => onSwipe(dir), 240);
  };
  const onPointerUp = () => {
    if (Math.abs(drag.x) > threshold) {
      finish(drag.x > 0 ? "right" : "left");
    } else {
      setDrag({ x: 0, y: 0, dragging: false });
    }
  };

  const x = released === "right" ? 600 : released === "left" ? -600 : drag.x;
  const rotation = x / 18;
  const likeOpacity = Math.max(0, Math.min(1, drag.x / threshold));
  const passOpacity = Math.max(0, Math.min(1, -drag.x / threshold));

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{
        transform: `translate3d(${x}px, ${drag.y * 0.2}px, 0) rotate(${rotation}deg)`,
        transition: drag.dragging ? "none" : "transform 240ms cubic-bezier(.2,.7,.3,1)",
        cursor: drag.dragging ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <ProfileCard profile={profile} viewer={viewer} />
      <div
        className="absolute top-8 left-6 rotate-[-12deg] border-4 border-primary text-primary font-black text-2xl tracking-widest px-3 py-1 rounded-lg bg-background/80"
        style={{ opacity: likeOpacity }}
      >
        <Heart className="inline h-6 w-6 fill-current mr-2" />
        LIKE
      </div>
      <div
        className="absolute top-8 right-6 rotate-[12deg] border-4 border-destructive text-destructive font-black text-2xl tracking-widest px-3 py-1 rounded-lg bg-background/80"
        style={{ opacity: passOpacity }}
      >
        <X className="inline h-6 w-6 mr-2" />
        NOPE
      </div>
    </div>
  );
}

// Silence unused imports if motion isn't installed.
void useMotionValue;
void useTransform;
void motion;
export type { PanInfo };
