"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import AccountantDashboard from "./AccountantDashboard";
import SubAdminDashboard from "./SubAdminDashboard";
import SuperAdminDashboard from "./SuperAdminDashboard";
import TechnicalDashboard from "./TechnicalDashboard";

/**
 * Role-based admin router: checks the signed-in user's isAdmin/adminType and renders the
 * matching console. Non-admins are redirected to "/"; a "community" adminType has no admin
 * console at all and goes to /creator instead (community admins moderate from inside the
 * Creator Studio, not here).
 */
export default function AdminClient() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const isAdmin = profile?.isAdmin === true;
  const adminType = profile?.adminType;

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdmin) {
      router.replace("/");
      return;
    }
    if (adminType === "community") {
      router.replace("/creator");
    }
  }, [loading, user, isAdmin, adminType, router]);

  if (loading || !user || !isAdmin || adminType === "community") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const adminName = profile.displayName ?? "Admin";

  if (adminType === "accountant") return <AccountantDashboard adminName={adminName} />;
  if (adminType === "technical") return <TechnicalDashboard adminName={adminName} />;
  if (adminType === "sub") return <SubAdminDashboard adminName={adminName} />;
  // adminType is "super" or undefined (undefined == the original, un-typed admin account).
  return <SuperAdminDashboard adminName={adminName} />;
}
