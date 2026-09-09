import { Banknote } from "lucide-react";
import AdminFinanceTab from "./AdminFinanceTab";

export interface AccountantDashboardProps {
  adminName: string;
}

/** Accountant console: nothing but the Finance tab's content — no user data, works, reports,
 * or announcements are reachable from here at all. */
export default function AccountantDashboard({ adminName }: AccountantDashboardProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
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

      <div className="mt-10">
        <AdminFinanceTab />
      </div>
    </div>
  );
}
