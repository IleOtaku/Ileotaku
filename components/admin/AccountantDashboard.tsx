"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Banknote } from "lucide-react";
import { Skeleton, Tabs } from "@/components/ui";

// Each tab is only loaded when it's first opened (same approach as SuperAdminDashboard).
const Loading = () => <Skeleton className="h-48 w-full rounded-2xl" />;
const AccountantOverviewTab = dynamic(() => import("./accountant/AccountantOverviewTab"), { ssr: false, loading: Loading });
const CreatorEarningsTab = dynamic(() => import("./accountant/CreatorEarningsTab"), { ssr: false, loading: Loading });
const AccountantTransactionsTab = dynamic(() => import("./accountant/AccountantTransactionsTab"), { ssr: false, loading: Loading });
const PayoutHistoryTab = dynamic(() => import("./accountant/PayoutHistoryTab"), { ssr: false, loading: Loading });

type AccountantTab = "overview" | "earnings" | "transactions" | "history";

export interface AccountantDashboardProps {
  adminName: string;
}

/** Accountant console: revenue overview, per-creator earnings + payout preparation, the
 * transaction ledger, and payout history. No user data, works, reports or announcements are
 * reachable from here. Payouts prepared here are only ever SENT by a Super Admin. */
export default function AccountantDashboard({ adminName }: AccountantDashboardProps) {
  const [tab, setTab] = useState<AccountantTab>("overview");

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="kente-bar mb-6 rounded-full" />
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Banknote className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-cinzel text-2xl text-text">Finance Dashboard</h1>
          <p className="font-noto text-sm text-muted">Welcome back, {adminName}.</p>
        </div>
      </div>

      <section className="mt-10">
        <div className="overflow-x-auto">
          <Tabs
            tabs={[
              { label: "Overview", value: "overview" },
              { label: "Creator Earnings", value: "earnings" },
              { label: "Transactions", value: "transactions" },
              { label: "Payout History", value: "history" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as AccountantTab)}
          />
        </div>

        <div className="mt-8">
          {tab === "overview" && <AccountantOverviewTab />}
          {tab === "earnings" && <CreatorEarningsTab />}
          {tab === "transactions" && <AccountantTransactionsTab />}
          {tab === "history" && <PayoutHistoryTab />}
        </div>
      </section>
    </div>
  );
}
