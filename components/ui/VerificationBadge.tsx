import { getVerificationBadge } from "@/lib/verification";

export interface VerificationBadgeUser {
  isFounder?: boolean;
  isAdmin?: boolean;
  isVerified?: boolean;
  verifiedType?: string | null;
  /** Legacy fallback — see getVerificationBadge's own doc comment. */
  isPublisher?: boolean;
}

/**
 * The one place the app's 5-tier verification badge renders — every surface that shows a user's
 * name (feed posts, comments, DMs, search results, profile headers, story circles, the admin
 * users table, live reader chat, etc.) should use THIS instead of an inline check, so the
 * hierarchy/colors only ever need to change in one place (see lib/verification.ts's
 * getVerificationBadge for the actual tier logic).
 */
export function VerificationBadge({
  user,
  size = 14,
}: {
  user: VerificationBadgeUser | null | undefined;
  size?: number;
}) {
  const badge = user ? getVerificationBadge(user) : null;
  if (!badge) return null;

  return (
    <span title={badge.label} className="inline-flex items-center shrink-0">
      <svg width={size} height={size} viewBox="0 0 24 24" fill={badge.color}>
        <path
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke={badge.color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke={badge.color}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
