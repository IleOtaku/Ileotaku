"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type CheckStatus = "checking" | "healthy" | "down";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  responseMs: number | null;
}

/** Runs one health check, timing it and capping how long it can block the panel — a check
 * that never resolves (observed with some Firestore/Storage SDK calls against certain rule
 * configurations, which can stall silently rather than rejecting) would otherwise leave the
 * whole panel stuck on "Checking..." forever instead of reporting that one row as down. */
async function timed(fn: () => Promise<void>, timeoutMs = 6000): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out")), timeoutMs)
      ),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runChecks(): Promise<CheckResult[]> {
  const [firestoreCheck, authCheck, cloudinaryCheck, paystackCheck] = await Promise.all([
    timed(async () => {
      await getDoc(doc(db, "maintenance", "current"));
    }),
    timed(async () => {
      // authStateReady() resolves once the SDK has settled its initial auth state — a cheap,
      // reliable way to confirm the Auth SDK itself is initialized and responsive.
      await auth.authStateReady();
    }),
    timed(async () => {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      if (!cloudName) throw new Error("Not configured");
      // "sample" is a demo asset every Cloudinary account has by default — fetching it proves
      // this account's delivery CDN is actually reachable, not just that env vars are set.
      const res = await fetch(`https://res.cloudinary.com/${cloudName}/image/upload/sample`, {
        method: "HEAD",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    timed(async () => {
      const res = await fetch("/api/paystack/verify?reference=healthcheck", { cache: "no-store" });
      // A 400/500 with a JSON body still proves the route (and therefore Paystack's API) is
      // reachable — only a network-level failure should count as "down".
      await res.json();
    }),
  ]);

  return [
    { name: "Firestore", status: firestoreCheck.ok ? "healthy" : "down", detail: firestoreCheck.error ?? "Connected", responseMs: firestoreCheck.ms },
    { name: "Firebase Auth", status: authCheck.ok ? "healthy" : "down", detail: authCheck.error ?? "Connected", responseMs: authCheck.ms },
    { name: "Cloudinary", status: cloudinaryCheck.ok ? "healthy" : "down", detail: cloudinaryCheck.error ?? "Connected", responseMs: cloudinaryCheck.ms },
    { name: "Paystack API", status: paystackCheck.ok ? "healthy" : "down", detail: paystackCheck.error ?? "Reachable", responseMs: paystackCheck.ms },
  ];
}

/** Firestore / Firebase Auth / Storage / Paystack status rows, alongside ApiHealthMonitor's
 * three content-source rows in the Technical Dashboard's API Health tab. */
export default function PlatformStatusPanel() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(true);

  function runAll() {
    setChecking(true);
    runChecks()
      .then(setChecks)
      .finally(() => setChecking(false));
  }

  useEffect(runAll, []);

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-syne text-sm font-semibold text-text">Platform Status</h3>
        <button
          type="button"
          onClick={runAll}
          disabled={checking}
          className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Recheck"}
        </button>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-bg4">
        {checks.map((c) => (
          <div key={c.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  c.status === "healthy" ? "bg-green2" : c.status === "checking" ? "bg-gold" : "bg-clay2"
                }`}
              />
              <p className="font-syne text-sm font-semibold text-text">{c.name}</p>
            </div>
            <div className="text-right font-noto text-xs text-muted">
              <p>{c.status === "healthy" ? "Operational" : c.status === "checking" ? "Checking..." : "Down"}</p>
              <p>{c.responseMs !== null ? `${c.responseMs}ms` : "—"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
