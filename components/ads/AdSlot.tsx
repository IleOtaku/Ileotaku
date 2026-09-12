"use client";

import { useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isAdsFree } from "@/lib/ads";

export interface AdSlotProps {
  placement: "between-chapters" | "profile-sidebar";
  className?: string;
}

/**
 * One PropellerAds placement. Platinum members never see this render anything at all — the
 * component returns null before even reading the zone env vars, so there's no flash of an empty
 * ad container for paying readers. Free readers see a real ad once PropellerAds IDs are
 * configured, or a dev-only placeholder explaining what's missing while they aren't.
 */
export default function AdSlot({ placement, className }: AdSlotProps) {
  const { profile, loading } = useAuth();
  const adRef = useRef<HTMLDivElement>(null);

  // Wait for auth to resolve, then Platinum users see nothing — renders null entirely, with no
  // flash of an ad slot while a Platinum member's profile is still loading.
  if (loading) return null;
  if (isAdsFree(profile)) return null;

  const publisherId = process.env.NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID;
  const zoneId =
    placement === "between-chapters"
      ? process.env.NEXT_PUBLIC_PROPELLERADS_ZONE_BETWEEN_CHAPTERS
      : process.env.NEXT_PUBLIC_PROPELLERADS_ZONE_PROFILE;

  // If not configured yet show a placeholder in development so the layout is still visible to
  // work against; in production an unconfigured slot just renders nothing.
  if (!publisherId || !zoneId) {
    if (process.env.NODE_ENV === "development") {
      return (
        <div
          className={`flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-bg3 p-4 font-noto text-xs text-muted ${className ?? ""}`}
        >
          Ad slot ({placement}) — configure PropellerAds IDs in .env.local
        </div>
      );
    }
    return null;
  }

  return (
    <div ref={adRef} className={className} data-zone-id={zoneId}>
      {/* PropellerAds script injected here */}
    </div>
  );
}
