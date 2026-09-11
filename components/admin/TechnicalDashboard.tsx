"use client";

import { useState } from "react";
import { CheckCircle2, Shield } from "lucide-react";
import { Tabs } from "@/components/ui";
import AdminBugReportsTab from "./AdminBugReportsTab";
import AdminErrorLogsTab from "./AdminErrorLogsTab";
import AdminMaintenanceTab from "./AdminMaintenanceTab";
import PlatformStatusPanel from "./PlatformStatusPanel";

type TechTab = "errors" | "bugs" | "maintenance" | "health";

const TABS: { label: string; value: TechTab }[] = [
  { label: "Error Logs", value: "errors" },
  { label: "Bug Reports", value: "bugs" },
  { label: "Maintenance", value: "maintenance" },
  { label: "API Health", value: "health" },
];

export interface TechnicalDashboardProps {
  adminName: string;
}

/** Technical admin console: Error Logs / Bug Reports / Maintenance / API Health. Technical
 * staff can submit maintenance requests but can't approve them — only Super/Sub-Admin can. */
export default function TechnicalDashboard({ adminName }: TechnicalDashboardProps) {
  const [tab, setTab] = useState<TechTab>("errors");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="kente-bar mb-6 rounded-full" />
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Shield className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-cinzel text-2xl text-text">Technical Dashboard</h1>
          <p className="font-noto text-sm text-muted">Welcome back, {adminName}.</p>
        </div>
      </div>

      <div className="mt-10">
        <Tabs tabs={TABS} value={tab} onChange={(v) => setTab(v as TechTab)} />

        <div className="mt-8">
          {tab === "errors" && <AdminErrorLogsTab />}
          {tab === "bugs" && <AdminBugReportsTab />}
          {tab === "maintenance" && <AdminMaintenanceTab canApprove={false} />}
          {tab === "health" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3 rounded-2xl border border-green/30 bg-green/5 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green/15 text-green2">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-syne text-sm font-semibold text-text">
                    Platform is running on creator content only
                  </p>
                  <p className="mt-0.5 font-noto text-xs text-muted">
                    No external manga APIs are in use — every title on ÍléOtaku is published
                    directly by our creators (see lib/publishedSeries.ts).
                  </p>
                </div>
              </div>
              <PlatformStatusPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
