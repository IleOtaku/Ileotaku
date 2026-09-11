"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Loader2, Mail, ShieldAlert } from "lucide-react";
import { logout } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { submitAppeal } from "@/lib/appeals";

/**
 * Full-page ban notice, redirected to from BannedGate (components/layout/BannedGate.tsx)
 * whenever a signed-in user's profile has isBanned:true. Shows the ban reason/date the admin
 * recorded (see lib/admin.ts's permanentlyBanUser) and lets the account submit one appeal —
 * writes straight to appeals/{uid}, reviewed from the Super Admin dashboard's Appeals tab.
 */
export default function BannedPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // A signed-out visitor, or a signed-in account that ISN'T actually banned, has no business on
  // this page — send them back to the sign-in form or home respectively.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (profile && profile.isBanned !== true) {
      router.replace("/");
    }
  }, [loading, user, profile, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || reason.trim().length < 10) return;
    setSubmitting(true);
    try {
      await submitAppeal(profile, reason);
      setSubmitted(true);
      toast.success("Appeal submitted.");
    } catch {
      toast.error("Couldn't submit your appeal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || !profile || profile.isBanned !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const bannedDate = profile.bannedAt
    ? new Date(profile.bannedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-16 text-center sm:px-6">
      <div className="kente-bar absolute top-0 left-0 right-0" />
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-950/60 text-red-300">
        <ShieldAlert className="h-8 w-8" />
      </span>
      <h1 className="mt-6 font-cinzel text-2xl text-text sm:text-3xl">Your account has been suspended</h1>

      {profile.bannedReason && (
        <p className="mt-4 max-w-md font-noto text-sm text-muted">
          <span className="font-semibold text-text">Reason: </span>
          {profile.bannedReason}
        </p>
      )}
      {bannedDate && <p className="mt-1 font-noto text-xs text-muted">Suspended on {bannedDate}</p>}

      <div className="mt-10 w-full max-w-md rounded-2xl border border-bg4 bg-bg2 p-6 text-left">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green2" />
            <p className="font-noto text-sm text-text">
              Your appeal has been submitted. We&apos;ll review it within 48 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="font-syne text-sm font-semibold text-text">Submit an Appeal</h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              minLength={10}
              required
              placeholder="Explain why you believe this suspension should be reconsidered..."
              className="input-base w-full resize-none text-sm"
            />
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 10}
              className="btn-primary w-full justify-center disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Appeal"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <a
          href="mailto:appeals@ileotaku.com"
          className="flex items-center gap-1.5 font-noto text-xs text-muted hover:text-gold"
        >
          <Mail className="h-3.5 w-3.5" /> Contact us
        </a>
        <button
          type="button"
          onClick={() => logout().then(() => router.replace("/auth/login"))}
          className="font-noto text-xs text-muted underline hover:text-text"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
