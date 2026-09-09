"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { ROULETTE_SEGMENT_VALUES, spinRoulette } from "@/lib/payments";
import { cn } from "@/lib/utils";

/** Same 8 colors, same order, as the segment values they're paired with — clay, gold, bg3,
 * green, clay2, gold2, bg4, muted, cycling through ÍléOtaku's actual palette rather than an
 * arbitrary rainbow. */
const SEGMENT_COLORS = [
  "#c4622d",
  "#d4a843",
  "#1a1510",
  "#3d6b4f",
  "#e07840",
  "#f0c96a",
  "#211c12",
  "#7a6a58",
];
const SEGMENT_COUNT = ROULETTE_SEGMENT_VALUES.length;
const SEGMENT_DEG = 360 / SEGMENT_COUNT;

const CONFETTI_COLORS = ["#c4622d", "#d4a843", "#3d6b4f", "#9ecfef", "#e07840", "#f0c96a"];

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Given the wheel's current resting rotation and the segment index that must end up under the
 * fixed top pointer, returns the rotation to animate TO. Segment `i` (0 = top, clockwise) is
 * centered at local angle `i*45 + 22.5` in the wheel's own unrotated conic-gradient — rotating
 * the wheel by `rotation` degrees moves that point to world angle `i*45 + 22.5 + rotation`, and
 * landing it at the pointer (world angle 0, mod 360) requires `rotation ≡ -(i*45+22.5) (mod
 * 360)`. `base` (the next 360°-aligned angle at or past the current rotation) plus several extra
 * full turns keeps the result comfortably ahead of `from`, so the wheel always visibly spins
 * forward rather than jumping or spinning backward. */
function computeLandingRotation(from: number, segmentIndex: number): number {
  const segmentCenter = segmentIndex * SEGMENT_DEG + SEGMENT_DEG / 2;
  const base = Math.ceil(from / 360) * 360;
  const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 extra full turns — well past the required minimum of 3
  return base + fullSpins * 360 - segmentCenter;
}

interface ConfettiPiece {
  id: number;
  color: string;
  angle: number;
  distance: number;
  duration: number;
  delay: number;
}

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    angle: Math.random() * 360,
    distance: 50 + Math.random() * 45,
    duration: 0.8 + Math.random() * 0.4,
    delay: Math.random() * 0.1,
  }));
}

/** The 45°-wide wedge polygon (a triangle from center to the two edge points bracketing the
 * segment) used to highlight the winning segment once the wheel has landed — always drawn at
 * the top, since that's where the pointer (and therefore the just-landed segment) always is. */
const WINNING_WEDGE_CLIP =
  "polygon(50% 50%, " +
  `${50 + 50 * Math.sin((-SEGMENT_DEG / 2 * Math.PI) / 180)}% ${50 - 50 * Math.cos((-SEGMENT_DEG / 2 * Math.PI) / 180)}%, ` +
  `${50 + 50 * Math.sin((SEGMENT_DEG / 2 * Math.PI) / 180)}% ${50 - 50 * Math.cos((SEGMENT_DEG / 2 * Math.PI) / 180)}%)`;

/** Daily coin-spin widget: a cinematic conic-gradient wheel, once-per-day gate, and a reward
 * pre-computed from spinRoulette() (server-authoritative) that the spin animation always lands
 * on exactly — see computeLandingRotation() above. */
export default function CoinRoulette() {
  const { user, profile } = useAuth();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinStyle, setSpinStyle] = useState<React.CSSProperties | null>(null);
  const [result, setResult] = useState<{ index: number; coins: number } | null>(null);
  const [countdown, setCountdown] = useState(msUntilMidnight());
  const rotationRef = useRef(0);

  const alreadySpunToday = profile?.lastRouletteSpin === todayKey();
  const streak = profile?.streakDays?.length ?? 0;
  const confetti = useMemo(() => (result ? makeConfetti() : []), [result]);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(msUntilMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSpin() {
    if (!user || spinning || alreadySpunToday) return;
    setSpinning(true);
    setResult(null);

    try {
      const res = await spinRoulette(user);
      if (res.status !== "spun" || res.segmentIndex === undefined) {
        toast.error("You've already spun today — come back tomorrow!");
        setSpinning(false);
        return;
      }

      const from = rotationRef.current;
      const target = computeLandingRotation(from, res.segmentIndex);
      setSpinStyle({
        "--start-rotation": `${from}deg`,
        "--spin-distance": `${target - from}deg`,
        animation: "roulette-spin 3s forwards",
      } as React.CSSProperties);

      setTimeout(async () => {
        rotationRef.current = target;
        setRotation(target);
        setSpinStyle(null);
        setSpinning(false);
        setResult({ index: res.segmentIndex!, coins: res.coins ?? 0 });
        toast.success(`You won ${res.coins?.toFixed(1)} coins! 🎉`);
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
      }, 3000);
    } catch {
      setSpinning(false);
      toast.error("Something went wrong. Please try again.");
    }
  }

  const nextMilestone = streak < 7 ? 7 : streak < 30 ? 30 : null;
  const nextBonus = nextMilestone === 7 ? 10 : 50;
  const milestoneProgress = nextMilestone ? Math.min(100, (streak / nextMilestone) * 100) : 100;
  const hitMilestone = streak === 7 || streak === 30;

  return (
    <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-bg4 bg-bg2 p-6 text-center">
      <div className="kente-bar absolute inset-x-0 top-0" />
      {/* Ambient clay glow behind the wheel */}
      <div
        className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #c4622d, transparent 70%)" }}
      />

      <h3 className="relative mt-1 font-cinzel text-lg text-gold">Daily Coin Roulette 🎰</h3>

      <div
        className="relative mx-auto aspect-square w-full"
        style={{ "--wheel-size": "clamp(240px, 60vw, 280px)", maxWidth: "var(--wheel-size)" } as React.CSSProperties}
      >
        {/* Fixed pointer — a sibling of the rotating wheel, never itself rotated */}
        <div className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 -translate-y-1 border-x-[10px] border-t-[18px] border-x-transparent border-t-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />

        {/* Rotating wheel surface */}
        <div
          className={cn(
            "h-full w-full rounded-full border-4 shadow-2xl transition-[filter] duration-500",
            alreadySpunToday ? "border-bg4 grayscale" : "border-bg4"
          )}
          style={{
            transform: `rotate(${rotation}deg)`,
            background: `conic-gradient(${SEGMENT_COLORS.map(
              (c, i) => `${c} ${i * SEGMENT_DEG}deg ${(i + 1) * SEGMENT_DEG}deg`
            ).join(", ")})`,
            ...(spinStyle ?? {}),
          }}
        >
          {ROULETTE_SEGMENT_VALUES.map((value, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 origin-top font-syne text-xs font-bold text-ivory drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
              style={{
                transform: `rotate(${i * SEGMENT_DEG + SEGMENT_DEG / 2}deg) translate(-50%, calc(var(--wheel-size) / -2 + 30px))`,
              }}
            >
              {value} 🪙
            </span>
          ))}
        </div>

        {/* Winning-segment glow — always drawn at the top, since the landed segment is always
            under the pointer by construction (see computeLandingRotation). */}
        {result !== null && !spinning && (
          <div
            className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-full"
            style={{
              clipPath: WINNING_WEDGE_CLIP,
              background: "radial-gradient(circle at 50% 15%, rgba(240,201,106,0.55), transparent 70%)",
              filter: "drop-shadow(0 0 18px rgba(212,168,67,0.85))",
            }}
          />
        )}

        {/* Center hub — fixed, never rotates */}
        <div className="absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold bg-bg2 text-2xl shadow-[0_0_20px_rgba(212,168,67,0.55)]">
          🪙
        </div>

        {/* Already-spun overlay */}
        {alreadySpunToday && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-full bg-bg/70 text-center backdrop-blur-[1px]">
            <p className="font-syne text-xs font-semibold text-text">Come back tomorrow</p>
            <p className="font-cinzel text-base text-gold">{formatCountdown(countdown)}</p>
          </div>
        )}

        {/* Confetti burst */}
        {result !== null && (
          <div className="pointer-events-none absolute inset-0 overflow-visible">
            {confetti.map((c) => (
              <span
                key={c.id}
                className="confetti-piece absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
                style={
                  {
                    backgroundColor: c.color,
                    "--angle": `${c.angle}deg`,
                    "--distance": `${-c.distance}px`,
                    animationDuration: `${c.duration}s`,
                    animationDelay: `${c.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}
      </div>

      {result !== null && !spinning && (
        <div className="animate-slide-up flex flex-col items-center gap-1">
          <p className="font-cinzel text-2xl text-gold2">+{result.coins.toFixed(1)} coins</p>
          <p className="font-noto text-sm text-text">You won {result.coins.toFixed(1)} coins! 🎉</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSpin}
        disabled={spinning || alreadySpunToday || !user}
        className={cn(
          "w-full rounded-full bg-gradient-to-r from-clay to-gold px-6 py-3.5 font-cinzel text-base font-bold tracking-[0.15em] text-ivory shadow-lg transition-all duration-200",
          spinning || alreadySpunToday || !user
            ? "cursor-not-allowed opacity-40 grayscale"
            : "hover:shadow-[0_0_24px_rgba(212,168,67,0.55)]"
        )}
      >
        {spinning ? "SPINNING..." : "SPIN"}
      </button>

      <div className="w-full border-t border-bg4 pt-3">
        <p className="flex items-center justify-center gap-1.5 font-noto text-xs font-semibold text-clay2">
          <Flame className="h-3.5 w-3.5" /> Day {streak} streak
        </p>
        {nextMilestone !== null ? (
          <div className="mt-2">
            <p className="font-noto text-[11px] text-muted">
              {nextMilestone} days = {nextBonus} bonus coins — {nextMilestone - streak} day
              {nextMilestone - streak === 1 ? "" : "s"} to go
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg4">
              <div
                className="h-full rounded-full bg-gradient-to-r from-clay to-gold transition-all duration-500"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-1.5 font-noto text-[11px] text-muted">30-day milestone reached — legendary streak!</p>
        )}
        {hitMilestone && (
          <p className="mt-2 font-cinzel text-xs text-gold">🎉 Milestone reached — bonus coins awarded!</p>
        )}
      </div>
    </div>
  );
}
