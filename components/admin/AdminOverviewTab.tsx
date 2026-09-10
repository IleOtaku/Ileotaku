"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  FileClock,
  Megaphone,
  ShieldAlert,
  ShieldPlus,
  Sparkles,
  UserPlus,
  Users as UsersIcon,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getAdminOverviewStats,
  getRecentSignups,
  getRevenueLast7Days,
  getTopCreatorsByEarningsThisMonth,
  getTopSeriesByReadsThisWeek,
  type AdminOverviewStats,
  type DailyRevenuePoint,
  type TopCreatorEntry,
  type TopSeriesEntry,
} from "@/lib/admin";
import { subscribeToPendingWorkCount } from "@/lib/firestore";
import { initials, stringToColor } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import type { UserProfile } from "@/types";
import AddAdminModal from "./AddAdminModal";
import AdminMaintenanceTab from "./AdminMaintenanceTab";
import RevenueBarChart from "./RevenueBarChart";

export interface AdminOverviewTabProps {
  canManageAdmins: boolean;
  canSendAnnouncements: boolean;
  onNavigateToAnnouncements: () => void;
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <Icon className="h-5 w-5 text-gold" />
      <p className="mt-3 font-cinzel text-xl text-text">{value}</p>
      <p className="font-noto text-xs text-muted">{label}</p>
    </div>
  );
}

/** Super/Sub-Admin Overview tab: live stats strip, 7-day revenue chart, weekly/monthly
 * leaderboards, recent signups, and the quick-action shortcuts (Add Admin / Send Announcement
 * / Maintenance Mode — the last one expands the same submit-and-approve panel Technical staff
 * use, so Super/Sub-Admins can activate a window directly or approve one Technical submitted). */
export default function AdminOverviewTab({
  canManageAdmins,
  canSendAnnouncements,
  onNavigateToAnnouncements,
}: AdminOverviewTabProps) {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [revenue, setRevenue] = useState<DailyRevenuePoint[]>([]);
  const [topSeries, setTopSeries] = useState<TopSeriesEntry[]>([]);
  const [topCreators, setTopCreators] = useState<TopCreatorEntry[]>([]);
  const [recentSignups, setRecentSignups] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  // Overrides stats.pendingReviews once the live listener below reports in — the rest of
  // `stats` stays a one-shot fetch (a full live-stats overview is a bigger rearchitecture than
  // this one card needs), but this specific number is exactly the one admins watch to know
  // whether there's new triage work waiting, so it's worth being instant.
  const [livePendingCount, setLivePendingCount] = useState<number | null>(null);

  useEffect(() => subscribeToPendingWorkCount(setLivePendingCount), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAdminOverviewStats(),
      getRevenueLast7Days(),
      getTopSeriesByReadsThisWeek(),
      getTopCreatorsByEarningsThisMonth(),
      getRecentSignups(10),
    ])
      .then(([s, r, ts, tc, rs]) => {
        if (cancelled) return;
        setStats(s);
        setRevenue(r);
        setTopSeries(ts);
        setTopCreators(tc);
        setRecentSignups(rs);
      })
      .catch(() => {
        if (!cancelled) toast.error("Some overview data couldn't load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={UsersIcon} label="Total Users" value={stats.totalUsers.toLocaleString()} />
        <StatCard icon={BadgeCheck} label="Platinum Users" value={stats.platinumUsers.toLocaleString()} />
        <StatCard icon={Sparkles} label="Active Creators" value={stats.activeCreators.toLocaleString()} />
        <StatCard icon={ShieldPlus} label="Publishers" value={stats.publishers.toLocaleString()} />
        <StatCard icon={FileClock} label="Pending Reviews" value={(livePendingCount ?? stats.pendingReviews).toLocaleString()} />
        <StatCard icon={ShieldAlert} label="Open Reports" value={stats.openReports.toLocaleString()} />
        <StatCard icon={Banknote} label="Revenue This Month" value={`₦${stats.revenueThisMonthNGN.toLocaleString()}`} />
        <StatCard icon={UserPlus} label="Today's Signups" value={stats.todaySignups.toLocaleString()} />
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Revenue — Last 7 Days</h3>
        <RevenueBarChart data={revenue} />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Top Series This Week</h3>
          {topSeries.length === 0 ? (
            <p className="font-noto text-xs text-muted">No reads recorded this week yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {topSeries.map((s, i) => (
                <li key={s.mangaId} className="flex items-center justify-between gap-2 font-noto text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-cinzel text-xs text-gold">{i + 1}</span>
                    <span className="truncate text-text">{s.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{s.reads} reads</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Top Creators This Month</h3>
          {topCreators.length === 0 ? (
            <p className="font-noto text-xs text-muted">No payout records for this month yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {topCreators.map((c, i) => (
                <li key={c.creatorId} className="flex items-center justify-between gap-2 font-noto text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-cinzel text-xs text-gold">{i + 1}</span>
                    <span className="truncate text-text">{c.creatorName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">₦{c.amount.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-3 font-syne text-sm font-semibold text-text">Recent Signups</h3>
        {recentSignups.length === 0 ? (
          <p className="font-noto text-xs text-muted">No signups yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentSignups.map((u) => (
              <div key={u.uid} className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-syne text-[10px] font-bold text-ivory"
                  style={{ backgroundColor: stringToColor(u.displayName) }}
                >
                  {initials(u.displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate font-noto text-sm text-text">{u.displayName}</span>
                <span className="shrink-0 font-noto text-xs text-muted">
                  {u.createdAt && !Number.isNaN(new Date(u.createdAt).getTime())
                    ? new Date(u.createdAt).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-3 font-syne text-sm font-semibold text-text">Quick Actions</h3>
        <div className="flex flex-wrap items-center gap-3">
          {canManageAdmins && (
            <button type="button" onClick={() => setAddAdminOpen(true)} className="btn-ghost flex items-center gap-2 text-sm">
              <UserPlus className="h-4 w-4" /> Add Admin
            </button>
          )}
          {canSendAnnouncements && (
            <button type="button" onClick={onNavigateToAnnouncements} className="btn-ghost flex items-center gap-2 text-sm">
              <Megaphone className="h-4 w-4" /> Send Announcement
            </button>
          )}
          <button
            type="button"
            onClick={() => setMaintenanceOpen((o) => !o)}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <Wrench className="h-4 w-4" /> {maintenanceOpen ? "Hide Maintenance Mode" : "Maintenance Mode"}
          </button>
        </div>

        {maintenanceOpen && (
          <div className="mt-5 border-t border-bg4 pt-5">
            <AdminMaintenanceTab canApprove />
          </div>
        )}
      </section>

      {canManageAdmins && <AddAdminModal open={addAdminOpen} onClose={() => setAddAdminOpen(false)} />}
    </div>
  );
}
