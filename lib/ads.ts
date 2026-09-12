import type { UserProfile } from "@/types";

/** Whether `profile` should see zero ads right now — true for every actual Platinum account,
 * and also true for a free account currently inside a purchased ad-free window (see
 * purchaseAdsFreeHour in lib/payments.ts, beta feedback: "Allow free users to buy 1hr ads free
 * with coins"). Every ad component (MonetagScript/PropellerAdsScript/ReaderAdScript/AdSlot)
 * should gate on this instead of checking `isPlatinum` directly, so the coins-bought window
 * actually works everywhere Platinum's own ad-free status already does. */
export function isAdsFree(profile: Pick<UserProfile, "isPlatinum" | "adsFreeUntil"> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.isPlatinum) return true;
  if (profile.adsFreeUntil && new Date(profile.adsFreeUntil).getTime() > Date.now()) return true;
  return false;
}
