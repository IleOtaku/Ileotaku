"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

/** Email capture for the African Originals "Coming Soon" hero — no backend yet, so this simulates the request. */
export default function EmailSignupForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="flex items-center gap-2 font-syne text-sm font-semibold text-green2">
        <CheckCircle2 className="h-5 w-5" /> You&apos;re on the list — we&apos;ll email you the moment it
        launches.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-base pl-9"
        />
      </div>
      <button type="submit" disabled={submitting} className="btn-gold shrink-0">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Notify Me"}
      </button>
    </form>
  );
}
