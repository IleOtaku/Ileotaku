"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { CheckCircle2, Clock, Lock, Loader2, XCircle } from "lucide-react";
import { Select } from "@/components/ui";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useAuth } from "@/hooks/useAuth";
import { getPostsByCreator } from "@/lib/creatorFeed";
import { evaluateVerificationRequirements, type RequirementCheck } from "@/lib/verification";
import {
  purchaseWhiteVerification,
  purchaseWhiteVerificationWithCard,
  VERIFICATION_PRICES,
  verificationIsPermanent,
  verificationTierOf,
} from "@/lib/payments";
import {
  getVerificationApplication,
  isWhiteVerificationExpired,
  submitVerificationApplication,
} from "@/lib/verification";
import type { VerificationApplication, VerificationCategory } from "@/types";

const CATEGORY_OPTIONS: { label: string; value: VerificationCategory }[] = [
  { label: "Content Creator", value: "Content Creator" },
  { label: "Writer", value: "Writer" },
  { label: "Artist", value: "Artist" },
  { label: "Musician", value: "Musician" },
  { label: "Brand", value: "Brand" },
  { label: "Other", value: "Other" },
];

const MIN_REASON_LENGTH = 50;

/** Beta feedback / 5-tier verification overhaul (Part 4): "Apply for Verification" — Platinum-only
 * self-service application, triaged from the admin dashboard's Verification Applications tab
 * (approveApplication/rejectApplication in lib/verification.ts). Free accounts see an upsell
 * instead of the form; an account that's already applied sees its current status rather than the
 * form again (except after a rejection, where reapplying re-opens it). */
export default function VerificationApplicationSection() {
  const { user, profile } = useAuth();
  const [application, setApplication] = useState<VerificationApplication | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [links, setLinks] = useState(["", "", ""]);
  const [category, setCategory] = useState<VerificationCategory>("Content Creator");
  const [submitting, setSubmitting] = useState(false);

  const [renewing, setRenewing] = useState(false);
  // "Simple but difficult" requirements — see VERIFICATION_REQUIREMENTS in lib/verification.ts.
  const [requirements, setRequirements] = useState<RequirementCheck[] | null>(null);
  const requirementsMet = requirements?.every((r) => r.met) ?? false;

  const isPlatinum = profile?.isPlatinum === true;
  // Paid "white" verification: approved without Platinum, so it has an expiry that needs coin
  // renewals. `verificationExpiresAt` is kept after it lapses (see the field's doc comment), so
  // this stays true for an expired account too — that's exactly who most needs the Renew button.
  const hasRenewableVerification = !!profile && !verificationIsPermanent(profile) && (!isPlatinum || profile.verifiedType === "creator" || profile.verifiedType === "publisher");
  const tierPrices = VERIFICATION_PRICES[verificationTierOf(profile ?? {})];
  const WHITE_VERIFICATION_PRICE = tierPrices.coins;
  const WHITE_VERIFICATION_PRICE_NGN = tierPrices.ngn;

  useEffect(() => {
    if (!user || !profile || !isPlatinum) return;
    let cancelled = false;
    getPostsByCreator(user.uid).then((posts) => {
      if (!cancelled) setRequirements(evaluateVerificationRequirements(profile, posts.filter((p) => !p.isDraft).map((p) => p.createdAt)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isPlatinum, profile?.createdAt, profile?.followers?.length]);

  useEffect(() => {
    if (!user || !isPlatinum) {
      setApplication(null);
      return;
    }
    let cancelled = false;
    getVerificationApplication(user.uid)
      .then((app) => {
        if (!cancelled) setApplication(app);
      })
      .catch(() => {
        if (!cancelled) setApplication(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPlatinum]);

  async function handleSubmit() {
    if (!user || !profile) return;
    if (!requirementsMet) {
      toast.error("You don't meet the requirements yet — see the checklist above the form.");
      return;
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(`Tell us a bit more — at least ${MIN_REASON_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    try {
      await submitVerificationApplication(user.uid, {
        displayName: profile.displayName,
        handle: profile.handle,
        photoURL: profile.photoURL,
        reason,
        links: links.filter((l) => l.trim()),
        category,
      });
      toast.success("Application submitted! We review applications within 48 hours.");
      const fresh = await getVerificationApplication(user.uid);
      setApplication(fresh);
      setShowForm(false);
      setReason("");
      setLinks(["", "", ""]);
    } catch {
      toast.error("Couldn't submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBuyWithCard() {
    if (!user) return;
    setRenewing(true);
    try {
      const result = await purchaseWhiteVerificationWithCard(user);
      if (result.success) toast.success("Verified for 30 days!");
      else toast.error(result.message ?? "Couldn't buy verification.");
    } finally {
      setRenewing(false);
    }
  }

  async function handleRenew() {
    if (!user) return;
    setRenewing(true);
    try {
      const result = await purchaseWhiteVerification(user.uid);
      if (result.success) toast.success("Verified for 30 days!");
      else toast.error(result.message ?? "Couldn't renew your verification.");
    } finally {
      setRenewing(false);
    }
  }

  if (hasRenewableVerification && profile) {
    // Beta feedback: "White Verifications should be bought for 1k per month. No need for a
    // verification appeal." — anyone (not just someone approved before) can buy it outright.
    const hasExpiry = !!profile.verificationExpiresAt;
    const expired = hasExpiry && isWhiteVerificationExpired(profile);
    const expiryLabel = hasExpiry
      ? new Date(profile.verificationExpiresAt as string).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
    const balance = profile.coins ?? 0;
    return (
      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <CheckCircle2 className="h-4 w-4 text-gold" /> Verification
        </h3>
        <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
          <p className="flex items-center gap-2 font-noto text-sm text-text">
            {!hasExpiry ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-gold" /> Get the verified badge — no application needed.
              </>
            ) : expired ? (
              <>
                <XCircle className="h-4 w-4 shrink-0 text-clay2" /> Your verification expired on {expiryLabel}.
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green2" /> Verified until {expiryLabel}
                <VerificationBadge user={profile} size={16} />
              </>
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={handleBuyWithCard} disabled={renewing} className="btn-primary w-fit disabled:opacity-40" data-testid="verify-card">
              {renewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `${hasExpiry ? "Renew" : "Get verified"} — ₦${WHITE_VERIFICATION_PRICE_NGN.toLocaleString()} per month`
              )}
            </button>
            <button
              type="button"
              onClick={handleRenew}
              disabled={renewing || balance < WHITE_VERIFICATION_PRICE}
              className="btn-ghost w-fit disabled:opacity-40"
              data-testid="verify-coins"
            >
              {`or ${WHITE_VERIFICATION_PRICE.toLocaleString()} 🪙`}
            </button>
          </div>
          <p className="font-noto text-[11px] text-muted">
            {balance < WHITE_VERIFICATION_PRICE
              ? `You have ${balance.toLocaleString()} coins — you need ${WHITE_VERIFICATION_PRICE.toLocaleString()}. `
              : ""}
            Platinum members keep their verification permanently, with no renewals.{" "}
            <Link href="/pricing" className="text-gold hover:underline">
              See Platinum
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (!isPlatinum) {
    return (
      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <CheckCircle2 className="h-4 w-4 text-gold" /> Verification
        </h3>
        <div className="rounded-2xl border border-dashed border-muted2 bg-bg2 p-5">
          <p className="flex items-center gap-2 font-noto text-sm text-muted">
            <Lock className="h-4 w-4 shrink-0" />
            Verification is available to Platinum members —{" "}
            <Link href="/pricing" className="text-gold hover:underline">
              upgrade to apply
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
        <CheckCircle2 className="h-4 w-4 text-gold" /> Verification
      </h3>
      <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-5">
        {application === undefined ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : !application || (application.status === "rejected" && showForm) ? (
          <>
            {application?.status === "rejected" && (
              <p className="rounded-lg border border-dashed border-clay2/40 bg-clay2/5 p-3 font-noto text-xs text-clay2">
                Reapplying — your previous application was rejected.
              </p>
            )}
            {requirements && (
              <div className="rounded-xl border border-bg4 bg-bg p-3" data-testid="verification-requirements">
                <p className="mb-2 font-syne text-xs font-semibold text-text">To apply you need all four:</p>
                <ul className="flex flex-col gap-1.5">
                  {requirements.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 font-noto text-xs">
                      <span className={`flex items-center gap-1.5 ${r.met ? "text-green2" : "text-muted"}`}>
                        {r.met ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        {r.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {Math.min(r.current, r.target)}/{r.target}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <label htmlFor="verify-reason" className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Why do you want verification?
              </label>
              <textarea
                id="verify-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Tell us about your work and why you should be verified..."
                className="input-base w-full resize-none"
              />
              <p className="mt-1 font-noto text-[11px] text-muted">
                {reason.trim().length}/{MIN_REASON_LENGTH} characters minimum
              </p>
            </div>

            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">
                Links to your work/social profiles
              </p>
              <div className="flex flex-col gap-2">
                {links.map((link, i) => (
                  <input
                    key={i}
                    value={link}
                    onChange={(e) =>
                      setLinks((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))
                    }
                    placeholder="https://..."
                    className="input-base w-full text-sm"
                  />
                ))}
              </div>
            </div>

            <Select
              label="What best describes you?"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(e) => setCategory(e.target.value as VerificationCategory)}
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || reason.trim().length < MIN_REASON_LENGTH || !requirementsMet}
              className="btn-primary w-fit disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Application"}
            </button>
          </>
        ) : application.status === "pending" ? (
          <p className="flex items-center gap-2 font-noto text-sm text-text">
            <Clock className="h-4 w-4 shrink-0 text-gold" /> Your application is under review.
          </p>
        ) : application.status === "approved" ? (
          <p className="flex items-center gap-2 font-noto text-sm text-text">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green2" /> Verified
            <VerificationBadge user={profile} size={16} />
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 font-noto text-sm text-text">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-clay2" />
              <span>
                Application rejected — {application.rejectionReason || "no reason given"}.
              </span>
            </p>
            <button type="button" onClick={() => setShowForm(true)} className="btn-ghost w-fit text-sm">
              Reapply
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
