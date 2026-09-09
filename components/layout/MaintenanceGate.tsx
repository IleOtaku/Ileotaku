"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeToMaintenanceState } from "@/lib/admin";
import { useAuth } from "@/hooks/useAuth";
import type { MaintenanceState } from "@/types";

function isWithinWindow(state: MaintenanceState, now: Date): boolean {
  if (!state.isActive) return false;
  if (state.startTime && now < new Date(state.startTime)) return false;
  if (state.endTime && now > new Date(state.endTime)) return false;
  return true;
}

function MaintenanceScreen({ state }: { state: MaintenanceState }) {
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="kente-bar absolute top-0 left-0 right-0" />
      <h1 className="font-cinzel text-3xl font-bold text-gold">ÍléOtaku</h1>
      <p className="mt-6 font-cinzel text-xl text-text">We&apos;ll be right back</p>
      {state.reason && <p className="mt-3 max-w-md font-noto text-sm text-muted">{state.reason}</p>}
      {state.endTime && (
        <p className="mt-2 font-noto text-xs text-muted">
          Expected back {new Date(state.endTime).toLocaleString()}
        </p>
      )}
      <div className="mt-8 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-clay"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Real-time gate on maintenance/current — while a window is active and the current moment
 * falls inside it, every visitor sees the full-screen maintenance page instead of `children`.
 * Signed-in admins (isAdmin:true) bypass it entirely so they can keep working during the
 * window. Re-evaluates every 30s so the screen clears itself the instant endTime passes,
 * without waiting for a fresh Firestore write.
 *
 * /auth routes are always exempt: if this were gated too, anyone who isn't ALREADY signed in
 * as an admin when a window opens (a fresh visit, an expired session, a different browser) has
 * no path back in — the sign-in form itself would be replaced by the maintenance screen along
 * with everything else, with no way to authenticate and reach the admin bypass. Letting the
 * sign-in flow through keeps that recovery path open without weakening the gate elsewhere.
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => subscribeToMaintenanceState(setState), []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const isAuthRoute = pathname?.startsWith("/auth") ?? false;
  const isAdmin = profile?.isAdmin === true;
  const showMaintenance =
    !isAuthRoute && !authLoading && !isAdmin && state !== null && isWithinWindow(state, now);

  if (showMaintenance && state) {
    return <MaintenanceScreen state={state} />;
  }

  return <>{children}</>;
}
