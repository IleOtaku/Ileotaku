import type { UserProfile } from "@/types";

type SuspendableProfile = Pick<UserProfile, "suspendedUntil"> | null | undefined;

/**
 * A suspension (set by a moderator via suspendUserFor(), lib/admin.ts) is a TIME-BOXED, PARTIAL
 * restriction — distinct from isBanned, which is a full, indefinite lockout enforced by
 * BannedGate before the app ever renders. A suspended account can still sign in, read manga/prose,
 * and view profiles; every other content-creating action (posting, DMs, comments, uploads, tips)
 * checks this and refuses with suspensionMessage() below. `suspendedUntil` in the past (or absent)
 * means not suspended — liftSuspension()/unbanUser() clear the field outright, but a suspension
 * that simply expired is just as inert without anyone having to run a cleanup job for it.
 */
export function isSuspended(profile: SuspendableProfile): boolean {
  if (!profile?.suspendedUntil) return false;
  return new Date(profile.suspendedUntil).getTime() > Date.now();
}

export function suspensionMessage(profile: SuspendableProfile): string {
  const until = profile?.suspendedUntil ? new Date(profile.suspendedUntil) : null;
  const dateStr =
    until && !Number.isNaN(until.getTime())
      ? until.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "further notice";
  return `Your account is suspended until ${dateStr}`;
}
