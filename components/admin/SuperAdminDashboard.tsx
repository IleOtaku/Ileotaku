"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Shield } from "lucide-react";
import { getAllUsers } from "@/lib/firestore";
import { getFeedback } from "@/lib/admin";
import { Skeleton, Tabs } from "@/components/ui";
import type { UserProfile } from "@/types";

// Sprint 10 perf audit: eight tabs' worth of admin UI were all bundled into /admin's initial
// load even though only one is ever visible at a time — dynamically importing each keeps the
// other seven out of the bundle until their tab is actually clicked. ssr:false is safe here:
// this whole dashboard only ever renders for a signed-in admin, well past first paint.
const AdminAnnouncementsTab = dynamic(() => import("./AdminAnnouncementsTab"), { ssr: false });
const AdminFeedbackTab = dynamic(() => import("./AdminFeedbackTab"), { ssr: false });
const AdminFeedTab = dynamic(() => import("./AdminFeedTab"), { ssr: false });
const AdminFinanceTab = dynamic(() => import("./AdminFinanceTab"), { ssr: false });
const AdminOverviewTab = dynamic(() => import("./AdminOverviewTab"), { ssr: false });
const AdminReportsTab = dynamic(() => import("./AdminReportsTab"), { ssr: false });
const AdminWorksTab = dynamic(() => import("./AdminWorksTab"), { ssr: false });
const UsersTable = dynamic(() => import("./UsersTable"), { ssr: false });

type SuperAdminTab =
  | "overview"
  | "users"
  | "works"
  | "feed"
  | "reports"
  | "announcements"
  | "finance"
  | "feedback";

export interface SuperAdminDashboardProps {
  adminName: string;
  /** Sub-Admin reuses this whole component, hiding Finance/Announcements and admin-management
   * actions — passed false only from SubAdminDashboard. */
  isSuperAdmin?: boolean;
}

/** Full admin console: Overview / Users / Works / Feed / Reports / Announcements / Finance /
 * Feedback. SubAdminDashboard renders this same component with isSuperAdmin=false, which hides
 * the Finance and Announcements tabs and the admin-role-management actions. */
export default function SuperAdminDashboard({ adminName, isSuperAdmin = true }: SuperAdminDashboardProps) {
  const [tab, setTab] = useState<SuperAdminTab>("overview");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [unresolvedFeedback, setUnresolvedFeedback] = useState(0);

  useEffect(() => {
    getAllUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    getFeedback()
      .then((entries) => setUnresolvedFeedback(entries.filter((e) => !e.resolved).length))
      .catch(() => setUnresolvedFeedback(0));
  }, [tab]);

  const TABS: { label: string; value: SuperAdminTab }[] = [
    { label: "Overview", value: "overview" },
    { label: "Users", value: "users" },
    { label: "Works", value: "works" },
    { label: "Feed", value: "feed" },
    { label: "Reports", value: "reports" },
    { label: "Announcements", value: "announcements" },
    { label: "Finance", value: "finance" },
    { label: unresolvedFeedback > 0 ? `Feedback (${unresolvedFeedback})` : "Feedback", value: "feedback" },
  ];
  const visibleTabs = isSuperAdmin ? TABS : TABS.filter((t) => t.value !== "finance" && t.value !== "announcements");

  function handleUserUpdated(uid: string, patch: Partial<UserProfile>) {
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...patch } : u)));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="kente-bar mb-6 rounded-full" />
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Shield className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-cinzel text-2xl text-text">Admin Panel</h1>
          <p className="font-noto text-sm text-muted">Welcome back, {adminName}.</p>
        </div>
      </div>

      <section className="mt-10">
        <Tabs tabs={visibleTabs} value={tab} onChange={(v) => setTab(v as SuperAdminTab)} />

        <div className="mt-8">
          {tab === "overview" && (
            <AdminOverviewTab
              canManageAdmins={isSuperAdmin}
              canSendAnnouncements={isSuperAdmin}
              onNavigateToAnnouncements={() => setTab("announcements")}
            />
          )}

          {tab === "users" &&
            (usersLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <UsersTable users={users} loading={false} canManageAdmins={isSuperAdmin} onUserUpdated={handleUserUpdated} />
            ))}

          {tab === "works" && <AdminWorksTab users={users} />}

          {tab === "feed" && <AdminFeedTab />}

          {tab === "reports" && <AdminReportsTab />}

          {isSuperAdmin && tab === "announcements" && <AdminAnnouncementsTab />}

          {isSuperAdmin && tab === "finance" && <AdminFinanceTab />}

          {tab === "feedback" && <AdminFeedbackTab />}
        </div>
      </section>
    </div>
  );
}
