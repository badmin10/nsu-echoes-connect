// Pointer-based swipe card; no animation library needed.
//
// Notes for mobile:
// - Uses absolute clientX/clientY deltas. `movementX` is not reported for touch
//   pointers on iOS Safari, which made the old card impossible to drag on iPhone.
// - `touch-none` on the card stops the browser from scrolling/zooming mid-drag.
// - A short tap (no drag) on the left/right side flips through photos.
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Heart, X } from "lucide-react";
import { haptic, profilePhotos, type DBProfile } from "@/lib/nsu";
import { ProfileCard } from "./ProfileCard";

export type SwipeDir = "left" | "right" | "up";
export type SwipeCardHandle = { swipe: (dir: SwipeDir) => void };

type Props = {
  profile: DBProfile;
  viewer: DBProfile | null;
  onSwipe: (dir: SwipeDir) => void;
  onOpenDetails?: () => void;
  isTop: boolean;
  depth: number;
};

const THRESHOLD_X = 100;
const THRESHOLD_Y = 120;
const FLICK_VELOCITY = 0.55; // px per ms
const TAP_SLOP = 8;

export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  { profile, viewer, onSwipe, onOpenDetails, isTop, depth },
  ref,
) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [released, setReleased] = useState<SwipeDir | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const crossed = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);
  const photoCount = profilePhotos(profile).length;

  const fly = useCallback(
    (dir: SwipeDir) => {
      if (released) return;
      haptic(dir === "up" ? 20 : 12);
      setDragging(false);
      setReleased(dir);
      window.setTimeout(() => onSwipe(dir), 260);
    },
    [released, onSwipe],
  );

  useImperativeHandle(ref, () => ({ swipe: fly }), [fly]);

  // Cards underneath: slightly smaller and lower; they grow as the top card moves away.
  if (!isTop) {
    return (
      <div
        className="absolute inset-0"
        style={{
          transform: `translate3d(0, ${depth * 10}px, 0) scale(${1 - depth * 0.045})`,
          transition: "transform 260ms cubic-bezier(.2,.7,.3,1)",
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <ProfileCard profile={profile} viewer={viewer} />
      </div>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (released || (e.pointerType === "mouse" && e.button !== 0)) return;
    elRef.current?.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    crossed.current = false;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    setPos({ x, y });
    const over = Math.abs(x) > THRESHOLD_X || -y > THRESHOLD_Y;
    if (over !== crossed.current) {
      crossed.current = over;
      if (over) haptic(8);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    const dt = Math.max(1, performance.now() - start.current.t);
    const vx = dx / dt;
    const vy = dy / dt;
    start.current = null;

    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
      // Tap: left third = previous photo, otherwise next photo.
      const rect = elRef.current?.getBoundingClientRect();
      if (rect && photoCount > 1) {
        const leftSide = e.clientX - rect.left < rect.width / 3;
        setPhotoIndex((i) => (leftSide ? Math.max(0, i - 1) : Math.min(photoCount - 1, i + 1)));
      }
      setPos({ x: 0, y: 0 });
      setDragging(false);
      return;
    }

    const horizontal = Math.abs(dx) >= Math.abs(dy);
    if (
      horizontal &&
      (Math.abs(dx) > THRESHOLD_X || (Math.abs(vx) > FLICK_VELOCITY && Math.abs(dx) > 40))
    ) {
      fly(dx > 0 ? "right" : "left");
      return;
    }
    if (!horizontal && (-dy > THRESHOLD_Y || (-vy > FLICK_VELOCITY && -dy > 50))) {
      fly("up");
      return;
    }
    setPos({ x: 0, y: 0 });
    setDragging(false);
  };

  const onPointerCancel = () => {
    start.current = null;
    setPos({ x: 0, y: 0 });
    setDragging(false);
  };

  const w = typeof window !== "undefined" ? window.innerWidth : 400;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = released === "right" ? w * 1.4 : released === "left" ? -w * 1.4 : pos.x;
  const y =
    released === "up"
      ? -h * 1.2
      : released
        ? pos.y * 0.3
        : pos.y * (Math.abs(pos.y) > Math.abs(pos.x) ? 1 : 0.25);
  const rotation = x / 16;
  const likeOpacity = released === "right" ? 1 : clamp01(pos.x / THRESHOLD_X);
  const passOpacity = released === "left" ? 1 : clamp01(-pos.x / THRESHOLD_X);
  const teaOpacity =
    released === "up" ? 1 : Math.abs(pos.y) > Math.abs(pos.x) ? clamp01(-pos.y / THRESHOLD_Y) : 0;

  return (
    <div
      ref={elRef}
      className="absolute inset-0 touch-none select-none will-change-transform"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
        transition: dragging ? "none" : "transform 300ms cubic-bezier(.2,.75,.3,1)",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ProfileCard
        profile={profile}
        viewer={viewer}
        photoIndex={photoIndex}
        onOpenDetails={onOpenDetails}
      />

      <Stamp
        className="top-14 left-5 -rotate-12 border-emerald-400 text-emerald-400"
        opacity={likeOpacity}
      >
        <Heart className="h-6 w-6 fill-current" /> LIKE
      </Stamp>
      <Stamp
        className="top-14 right-5 rotate-12 border-rose-500 text-rose-500"
        opacity={passOpacity}
      >
        <X className="h-6 w-6" strokeWidth={3} /> NOPE
      </Stamp>
      <Stamp
        className="bottom-40 left-1/2 -translate-x-1/2 -rotate-6 border-gold text-gold"
        opacity={teaOpacity}
      >
        ☕ TEA
      </Stamp>
    </div>
  );
});

function Stamp({
  className,
  opacity,
  children,
}: {
  className: string;
  opacity: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute pointer-events-none flex items-center gap-1.5 border-[3px] font-black text-2xl tracking-widest px-3 py-1 rounded-xl bg-black/25 backdrop-blur-sm ${className}`}
      style={{ opacity }}
    >
      {children}
    </div>
  );
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
