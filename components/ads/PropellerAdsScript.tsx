"use client";

import Script from "next/script";
import { useAuth } from "@/hooks/useAuth";

/**
 * Loads PropellerAds' main ad-provider script once per page, for free (non-Platinum) readers
 * only — Platinum members never load it at all, not even a script tag that then serves nothing.
 * Renders nothing until NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID is actually set (see .env.example).
 */
export default function PropellerAdsScript() {
  const { profile } = useAuth();
  const publisherId = process.env.NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID;

  if (profile?.isPlatinum || !publisherId) return null;

  return (
    <Script
      src="https://a.magsrv.com/ad-provider.js"
      strategy="afterInteractive"
      data-publisher-id={publisherId}
    />
  );
}
