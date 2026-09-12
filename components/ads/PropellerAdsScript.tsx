"use client";

import Script from "next/script";
import { useAuth } from "@/hooks/useAuth";
import { isAdsFree } from "@/lib/ads";

/**
 * Loads PropellerAds' main ad-provider script — required for AdSlot's between-chapters banner
 * (components/reader/NextChapterCard.tsx) to actually render anything into its `data-zone-id`
 * div. Rendered from within the reader page itself (see components/reader/ReaderClient.tsx), NOT
 * the root layout — ads must never load on any page but the reader. Free (non-Platinum) readers
 * only; waits for auth to resolve first so a Platinum member's profile still loading never lets
 * this script slip in before `isPlatinum` is known.
 */
export default function PropellerAdsScript() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (isAdsFree(profile)) return null;

  const publisherId = process.env.NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID;
  if (!publisherId) return null;

  return (
    <Script
      src="https://a.magsrv.com/ad-provider.js"
      strategy="afterInteractive"
      data-publisher-id={publisherId}
    />
  );
}
