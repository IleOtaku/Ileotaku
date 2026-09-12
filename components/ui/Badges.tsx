import { Gem } from "lucide-react";

/**
 * Platinum SUBSCRIPTION membership badge — a platinum-colored gem, replacing the old yellow ⭐
 * emoji everywhere it showed (profile headers, comments, feed posts, DMs, search results). A
 * small drop-shadow in the same platinum color stands in for a "glow" without needing an actual
 * blur filter/SVG gradient.
 *
 * Distinct from components/ui/VerificationBadge.tsx's admin tier, which happens to reuse this
 * same platinum color for an unrelated reason (an admin's authority, not a paid subscription) —
 * the two can both show side by side on the same name (a Platinum admin shows both).
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
