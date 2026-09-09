"use client";

import SuperAdminDashboard from "./SuperAdminDashboard";

export interface SubAdminDashboardProps {
  adminName: string;
}

/** Identical to SuperAdminDashboard except the Finance and Announcements tabs, and admin-role
 * management, are hidden — implemented by rendering the same component with isSuperAdmin=false
 * rather than duplicating five tabs' worth of near-identical markup. */
export default function SubAdminDashboard({ adminName }: SubAdminDashboardProps) {
  return <SuperAdminDashboard adminName={adminName} isSuperAdmin={false} />;
}
