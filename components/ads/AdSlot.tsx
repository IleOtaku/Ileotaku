"use client";

import { useEffect, useRef } from "react";
import HouseAd from "./HouseAd";
import { useAuth } from "@/hooks/useAuth";
import { isAdsFree } from "@/lib/ads";

export interface AdSlotProps {
  placement: "between-chapters" | "profile-sidebar";
  className?: string;
}

declare global {
  interface Window {
    AdProvider?: { push: (cmd: Record<string, unknown>) => void } | Record<string, unknown>[];
  }
}

/**
 * One PropellerAds placement. Platinum members never see this render anything at all — the
 * component returns null before even reading the zone env vars, so there's no flash of an empty
 * ad container for paying readers. Free readers see a real ad once PropellerAds IDs are
 * configured, or a dev-only placeholder explaining what's missing while they aren't.
 *
 * Beta feedback bug: "no ads between chapters" / "ads dont load" — this used to render a plain
 * `<div data-zone-id={...}>` and rely on PropellerAdsScript's page-level ad-provider.js to find
 * and fill it. That's not PropellerAds' actual banner contract: their script only serves into an
 * `<ins class="eas6a97888e" data-zoneid="...">` element (note: `data-zoneid`, not `data-zone-id`,
 * and that exact class name is what the provider script scans for), and only once something calls
 * `(window.AdProvider ??= []).push({ serve: {} })` — which nothing here was ever doing. No ad
 * request was ever actually made; the slot was just an inert box.
 */
export default function AdSlot({ placement, className }: AdSlotProps) {
  const { profile, loading } = useAuth();
  const insRef = useRef<HTMLModElement>(null);

  const publisherId = process.env.NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID;
  const zoneId =
    placement === "between-chapters"
      ? process.env.NEXT_PUBLIC_PROPELLERADS_ZONE_BETWEEN_CHAPTERS
      : process.env.NEXT_PUBLIC_PROPELLERADS_ZONE_PROFILE;
  // publisherId gates whether PropellerAdsScript even loads ad-provider.js at all (see that
  // component) — without it there's no library to serve this <ins>, so still fall back to
  // HouseAd exactly like before rather than rendering a slot that can never fill.
  const configured = !loading && !isAdsFree(profile) && !!zoneId && !!publisherId;

  useEffect(() => {
    if (!configured || !insRef.current) return;
    const provider = (window.AdProvider = window.AdProvider || []);
    if (Array.isArray(provider)) provider.push({ serve: {} });
  }, [configured, zoneId]);

  // Wait for auth to resolve, then Platinum users see nothing — renders null entirely, with no
  // flash of an ad slot while a Platinum member's profile is still loading.
  if (loading) return null;
  if (isAdsFree(profile)) return null;

  // If not configured yet show a placeholder in development so the layout is still visible to
  // work against; in production an unconfigured slot just renders nothing.
  // Beta feedback: ads are strictly between chapters. With no third-party zone configured, the slot shows
  // ÍléOtaku's own creative (components/ads/HouseAd.tsx) instead of staying empty.
  if (!zoneId || !publisherId) {
    return <HouseAd linkable className={className} />;
  }

  return <ins ref={insRef} className={`eas6a97888e ${className ?? ""}`} data-zoneid={zoneId} />;
}
