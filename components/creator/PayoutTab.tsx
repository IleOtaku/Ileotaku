"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ChevronDown, Loader2, Lock, Search } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { formatNGN, periodLabel } from "@/lib/earningsConfig";
import { callApi, getMyPayoutDetails } from "@/lib/payouts";
import type { EarningsRecord, PayoutDetails } from "@/types";

interface Bank {
  name: string;
  code: string;
}

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  pending: { label: "Processing", className: "bg-gold/15 text-gold" },
  processing: { label: "Processing", className: "bg-gold/15 text-gold" },
  paid: { label: "Paid", className: "bg-green/20 text-green2" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-400" },
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <p className="font-noto text-xs text-muted">{label}</p>
      <p className="mt-2 font-cinzel text-xl text-text">{value}</p>
      {hint && <p className="mt-1 font-noto text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Searchable bank selector — a plain filtered list rather than a native <select>, since Nigeria has
 * 100+ banks and nobody can find theirs by scrolling. */
function BankSelect({ banks, value, onChange, disabled }: { banks: Bank[]; value: Bank | null; onChange: (b: Bank) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, filter]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input-base flex w-full items-center justify-between text-left text-sm disabled:opacity-60"
      >
        <span className={value ? "text-text" : "text-muted"}>{value?.name ?? "Select your bank"}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-bg4 bg-bg2 shadow-xl">
          <div className="relative border-b border-bg4 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search banks..."
              className="input-base w-full pl-8 text-sm"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-4 py-3 font-noto text-xs text-muted">No bank matches “{filter}”.</li>}
            {shown.map((b) => (
              <li key={b.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(b);
                    setOpen(false);
                    setFilter("");
                  }}
                  className="w-full px-4 py-2 text-left font-noto text-sm text-text hover:bg-bg3"
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Creator dashboard → Payout tab: earnings summary, bank account (verified with Paystack before it
 * can be saved), and payout history. Bank details are only ever written by the server
 * (app/api/paystack/create-recipient), which resolves the account name from Paystack itself. */
export default function PayoutTab() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [rows, setRows] = useState<EarningsRecord[] | null>(null);
  const [thisMonthNGN, setThisMonthNGN] = useState<number | null>(null);
  const [saved, setSaved] = useState<PayoutDetails | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksError, setBanksError] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedKey, setVerifiedKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Own payout rows (what the server wrote when payouts were sent) — live.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "earnings"), where("creatorId", "==", uid)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EarningsRecord)),
      () => setRows([])
    );
  }, [uid]);

  // This month's estimate is computed server-side (it needs other users' reads/unlocks, which the
  // browser can't and shouldn't read) — so it refreshes on a timer instead of a live listener.
  const loadEstimate = useCallback(async () => {
    if (!user) return;
    try {
      const res = await callApi<{ earnings: { totalNetNGN: number } }>(user, "/api/creator/earnings");
      setThisMonthNGN(res.earnings.totalNetNGN);
    } catch {
      setThisMonthNGN((prev) => prev ?? 0);
    }
  }, [user]);

  useEffect(() => {
    loadEstimate();
    const timer = setInterval(loadEstimate, 60_000);
    return () => clearInterval(timer);
  }, [loadEstimate]);

  useEffect(() => {
    if (!uid) return;
    getMyPayoutDetails(uid)
      .then(setSaved)
      .catch(() => setSaved(null));
  }, [uid]);

  useEffect(() => {
    fetch("/api/paystack/banks")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: Bank[]) => setBanks(list))
      .catch(() => setBanksError(true));
  }, []);

  const currentKey = `${bank?.code ?? ""}:${accountNumber}`;
  const isVerified = !!verifiedName && verifiedKey === currentKey;

  async function handleVerify() {
    if (!user || !bank) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifiedName(null);
    try {
      const res = await callApi<{ account_name: string }>(
        user,
        `/api/paystack/verify-account?account_number=${accountNumber}&bank_code=${bank.code}`
      );
      setVerifiedName(res.account_name);
      setVerifiedKey(currentKey);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Couldn't verify this account.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSave() {
    if (!user || !bank || !isVerified) return;
    setSaving(true);
    try {
      await callApi(user, "/api/paystack/create-recipient", {
        method: "POST",
        body: { bankCode: bank.code, bankName: bank.name, accountNumber, accountName: verifiedName, creatorUid: user.uid },
      });
      toast.success("Bank account saved. You're set up for payouts!");
      setSaved(await getMyPayoutDetails(user.uid));
      setEditing(false);
      setBank(null);
      setAccountNumber("");
      setVerifiedName(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your bank account.");
    } finally {
      setSaving(false);
    }
  }

  const sortedRows = useMemo(
    () => [...(rows ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [rows]
  );
  const pendingNGN = sortedRows
    .filter((r) => r.payoutStatus === "pending" || r.payoutStatus === "processing")
    .reduce((s, r) => s + r.amount, 0);
  const paidNGN = sortedRows.filter((r) => r.payoutStatus === "paid").reduce((s, r) => s + r.amount, 0);
  const lastPaid = sortedRows.find((r) => r.payoutStatus === "paid");
  const allTimeNGN = paidNGN + pendingNGN + (thisMonthNGN ?? 0);

  const showForm = editing || saved === null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="font-cinzel text-xl text-text">Payout Settings 💰</h2>
        <Lock className="h-4 w-4 text-gold" aria-label="Secure" />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows === null || thisMonthNGN === null ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
        ) : (
          <>
            <StatCard label="This month" value={formatNGN(thisMonthNGN)} hint="Estimate · refreshes every minute" />
            <StatCard label="Pending payout" value={formatNGN(pendingNGN)} />
            <StatCard label="All time earned" value={formatNGN(allTimeNGN)} />
            <StatCard
              label="Last payout"
              value={lastPaid ? formatNGN(lastPaid.amount) : "—"}
              hint={lastPaid?.paidAt ? new Date(lastPaid.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No payouts yet"}
            />
          </>
        )}
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Bank Account</h3>

        {saved === undefined ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <>
            {saved && !editing && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-syne text-sm font-semibold text-green2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> <span className="truncate">{saved.accountName}</span>
                  </p>
                  <p className="mt-0.5 font-noto text-xs text-muted">
                    {saved.bankName} · •••• {saved.accountNumber.slice(-4)}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
                  Change account
                </button>
              </div>
            )}

            {showForm && (
              <div className="flex flex-col gap-4">
                {banksError ? (
                  <p className="font-noto text-sm text-clay2">Couldn&apos;t load the list of banks. Refresh and try again.</p>
                ) : banks.length === 0 ? (
                  <Skeleton className="h-11 w-full rounded-xl" />
                ) : (
                  <div>
                    <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Bank</label>
                    <BankSelect banks={banks} value={bank} onChange={(b) => { setBank(b); setVerifiedName(null); }} disabled={saving} />
                  </div>
                )}

                <div>
                  <label htmlFor="acct-number" className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                    Account number
                  </label>
                  <input
                    id="acct-number"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    value={accountNumber}
                    onChange={(e) => {
                      setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setVerifiedName(null);
                      setVerifyError(null);
                    }}
                    placeholder="10-digit NUBAN"
                    className="input-base w-full text-sm tabular-nums"
                  />
                </div>

                {isVerified && (
                  <p className="flex items-center gap-1.5 font-syne text-sm font-semibold uppercase text-green2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {verifiedName}
                  </p>
                )}
                {verifyError && <p className="font-noto text-xs text-clay2">{verifyError}</p>}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying || !bank || accountNumber.length !== 10}
                    className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-40"
                  >
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify Account
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !isVerified}
                    className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
                  </button>
                  {saved && (
                    <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-sm">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-4 flex items-center gap-1.5 font-noto text-[11px] text-muted">
          <Lock className="h-3 w-3 shrink-0" /> Your bank details are secured and only used for payouts.
        </p>
      </section>

      <section className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Payout History</h3>
        {rows === null ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : sortedRows.length === 0 ? (
          <p className="font-noto text-sm text-muted">No payouts yet — they&apos;ll show up here once your first one is sent.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRows.map((r) => {
              const badge = STATUS_STYLE[r.payoutStatus] ?? STATUS_STYLE.pending;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-syne text-sm font-semibold text-text">{formatNGN(r.amount)}</p>
                    <p className="font-noto text-xs text-muted">
                      {periodLabel(r.period)} · {new Date(r.paidAt ?? r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    {r.payoutStatus === "paid" && r.paystackReference && (
                      <p className="mt-0.5 break-all font-noto text-[10px] text-muted2">Ref: {r.paystackReference}</p>
                    )}
                    {r.payoutStatus === "failed" && r.failureReason && (
                      <p className="mt-0.5 font-noto text-[11px] text-red-400">{r.failureReason}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 font-syne text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
