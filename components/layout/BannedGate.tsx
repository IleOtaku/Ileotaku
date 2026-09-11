"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/**
 * Redirects a signed-in, banned account (profile.isBanned === true) to /banned instead of
 * letting them use the app with a permission-denied toast on every write — mirrors
 * MaintenanceGate's real-time-profile-driven redirect shape. /auth/* stays exempt so the sign-in
 * flow itself (and a banned user signing back in to see their ban notice) always works, and
 * /banned is exempt from redirecting to ITSELF.
 */
export default function BannedGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isExemptRoute = pathname?.startsWith("/auth") || pathname?.startsWith("/banned") || false;

  useEffect(() => {
    if (loading || isExemptRoute) return;
    if (profile?.isBanned === true) router.replace("/banned");
  }, [loading, profile, isExemptRoute, router]);

  return <>{children}</>;
}
