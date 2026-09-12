import { BadgeCheck, Gem } from "lucide-react";

export interface VerifiedBadgeProfile {
  isVerified?: boolean;
  /** Some older surfaces (search results, NavSearch) still carry this instead of/alongside
   * isVerified — treated as an equivalent signal, same as those surfaces already did. */
  verified?: boolean;
  isPublisher?: boolean;
  isFounder?: boolean;
}

/**
 * The one place the app's three-tier verified-checkmark color logic lives — every surface that
 * shows a verified badge (profile headers, comments, feed posts, DMs, search results, story
 * circles, notifications) should render THIS instead of its own inline `<BadgeCheck>`, so a
 * future color/copy change (or a fourth tier) only has one call site to touch.
 *
 * Tiers, in priority order:
 *  1. Founder (`isFounder: true`) — ÍléOtaku's own account, set manually and never through the
 *     ordinary verify flow. Gold, "ÍléOtaku Founder" tooltip. Wins over the other two even if the
 *     founder account also happens to be a publisher.
 *  2. Publisher-verified — purple, "Verified" tooltip. Unchanged from before this badge system.
 *  3. Creator-verified (the default) — blue, "Verified" tooltip. Unchanged from before this
 *     badge system.
 */
export function VerifiedBadge({
  profile,
  className = "h-3.5 w-3.5",
}: {
  profile: VerifiedBadgeProfile | null | undefined;
  className?: string;
}) {
  if (!profile) return null;
  const isVerified = profile.isVerified === true || profile.verified === true;
  if (!isVerified) return null;

  const colorClass = profile.isFounder ? "text-gold" : profile.isPublisher ? "text-purple-400" : "text-blue-400";

  return (
    <span className="inline-flex shrink-0" title={profile.isFounder ? "ÍléOtaku Founder" : "Verified"}>
      <BadgeCheck className={`${className} shrink-0 ${colorClass}`} />
    </span>
  );
}

/**
 * Platinum membership badge — a platinum-colored gem, replacing the old yellow ⭐ emoji
 * everywhere it showed (profile headers, comments, feed posts, DMs, search results). A small
 * drop-shadow in the same platinum color stands in for a "glow" without needing an actual blur
 * filter/SVG gradient.
 */
export function PlatinumBadge({
  isPlatinum,
  className = "h-3.5 w-3.5",
}: {
  isPlatinum?: boolean;
  className?: string;
}) {
  if (!isPlatinum) return null;
  return (
    <span className="inline-flex shrink-0" title="Platinum Member">
      <Gem
        className={`${className} shrink-0 fill-plat/20 text-plat`}
        style={{ filter: "drop-shadow(0 0 3px #9ecfef99)" }}
      />
    </span>
  );
}
