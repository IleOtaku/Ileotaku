"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, Search } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { getRecentTransactions, transactionsToCsv, type TransactionLogEntry } from "@/lib/admin";
import { formatNGN } from "@/lib/earningsConfig";

const TYPE_FILTERS: { label: string; match: (t: TransactionLogEntry) => boolean }[] = [
  { label: "All types", match: () => true },
  { label: "Coin purchases", match: (t) => t.category === "coins" },
  { label: "Platinum", match: (t) => t.category === "platinum" },
  { label: "Tips", match: (t) => t.category === "tip" },
  { label: "Chapter unlocks", match: (t) => t.category === "chapter_unlock" },
  { label: "Boosts", match: (t) => t.category === "boost" },
  { label: "Verification", match: (t) => t.category === "verification" },
  { label: "Other", match: (t) => !["coins", "platinum", "tip", "chapter_unlock", "boost", "verification"].includes(t.category ?? "") },
];

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-gold/30 text-inherit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** Accountant → Transactions: the platform-wide ledger (latest 500), searchable by transaction ID,
 * Paystack reference, name or email, filterable by type and date range, exportable as CSV. */
export default function AccountantTransactionsTab() {
  const [all, setAll] = useState<TransactionLogEntry[] | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeIdx, setTypeIdx] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    getRecentTransactions(500)
      .then(setAll)
      .catch(() => {
        setAll([]);
        toast.error("Couldn't load transactions.");
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return all.filter((t) => {
      if (!TYPE_FILTERS[typeIdx].match(t)) return false;
      const at = new Date(t.createdAt).getTime();
      if (at < fromMs || at > toMs) return false;
      if (!q) return true;
      return [t.id, t.paystackRef, t.userName, t.userEmail, t.description].some((f) => (f ?? "").toLowerCase().includes(q));
    });
  }, [all, search, typeIdx, from, to]);

  function handleExport() {
    const blob = new Blob([transactionsToCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ileotaku-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Transaction ID, reference, name or email..."
            aria-label="Search transactions"
            className="input-base w-full pl-9 text-sm"
          />
        </div>
        <select value={typeIdx} onChange={(e) => setTypeIdx(Number(e.target.value))} aria-label="Filter by type" className="input-base text-sm">
          {TYPE_FILTERS.map((f, i) => (
            <option key={f.label} value={i}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 font-noto text-xs text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-base text-xs" />
        </label>
        <label className="flex items-center gap-1.5 font-noto text-xs text-muted">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-base text-xs" />
        </label>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV ({filtered.length})
        </button>
      </div>

      {all === null ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-muted2 p-8 text-center font-noto text-sm text-muted">No transactions match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bg4">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-bg4 bg-bg3">
                {["Date", "Type", "Coins", "Amount (NGN)", "User", "Transaction ID", "Reference"].map((h) => (
                  <th key={h} className="p-2.5 font-syne text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={`${t.userId}-${t.id}`} className="border-b border-bg4 last:border-0">
                  <td className="whitespace-nowrap p-2.5 font-noto text-xs text-muted">{new Date(t.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="p-2.5 font-noto text-xs text-text">{t.category ?? t.type}</td>
                  <td className={`p-2.5 font-noto text-xs ${t.amount < 0 ? "text-clay2" : "text-green2"}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                  <td className="p-2.5 font-noto text-xs text-text">{t.amountNGN ? formatNGN(t.amountNGN) : "—"}</td>
                  <td className="max-w-[200px] p-2.5">
                    <p className="truncate font-noto text-xs text-text">
                      <Highlight text={t.userName ?? "—"} query={search} />
                    </p>
                    <p className="truncate font-noto text-[11px] text-muted">
                      <Highlight text={t.userEmail ?? ""} query={search} />
                    </p>
                  </td>
                  <td className="max-w-[140px] truncate p-2.5 font-noto text-[11px] text-muted">
                    <Highlight text={t.id} query={search} />
                  </td>
                  <td className="max-w-[160px] truncate p-2.5 font-noto text-[11px] text-muted">
                    {t.paystackRef ? <Highlight text={t.paystackRef} query={search} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-noto text-[11px] text-muted">Showing the latest 500 transactions across all users.</p>
    </div>
  );
}
