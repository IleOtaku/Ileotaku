"use client";

import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isSuspended, suspensionMessage } from "@/lib/suspension";

/**
 * Sticky banner shown on every page (reader/prose included — reading stays allowed while
 * suspended, this is just the standing reminder that everything else isn't) for the duration of a
 * moderator-set suspendedUntil. Renders above BannedGate/SiteChrome in app/layout.tsx so it isn't
 * skipped on the "immersive" routes (SiteChrome hides the normal navbar there, but this isn't that).
 */
export default function SuspensionBanner() {
  const { profile, loading } = useAuth();
  if (loading || !isSuspended(profile)) return null;

  return (
    <div
      data-testid="suspension-banner"
      className="sticky top-0 z-[90] flex items-center justify-center gap-2 bg-clay px-4 py-2 text-center font-noto text-xs font-semibold text-ivory"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{suspensionMessage(profile)}. You can still read content and make purchases, but posting and messaging are restricted.</span>
    </div>
  );
}
