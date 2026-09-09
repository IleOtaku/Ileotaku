"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { friendlyError, signUpEmail } from "@/lib/auth";
import SocialButtons from "./SocialButtons";

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH_META = [
  { label: "Too weak", color: "bg-muted2" },
  { label: "Weak", color: "bg-clay" },
  { label: "Fair", color: "bg-clay2" },
  { label: "Good", color: "bg-gold" },
  { label: "Strong", color: "bg-green2" },
];

/** Full signup form: account/sign-in mode tabs, social buttons, email form with a live password-strength meter. */
export default function SignupForm() {
  const pathname = usePathname();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = scorePassword(password);
  const meta = STRENGTH_META[password ? strength : 0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !email.trim() || !password) {
      toast.error("Please fill in every field.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await signUpEmail(`${firstName.trim()} ${lastName.trim()}`.trim(), email.trim(), password);
      setSuccess(true);
      setTimeout(() => router.push("/reader"), 1800);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex w-full max-w-md flex-col items-center gap-4 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
        >
          <CheckCircle2 className="h-16 w-16 text-green2" />
        </motion.div>
        <h2 className="font-cinzel text-2xl text-gold">Karibu, {firstName || "friend"}!</h2>
        <p className="font-noto text-muted">Your account is ready. Taking you to the reader…</p>
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 grid grid-cols-2 rounded-full border border-muted2 bg-bg3 p-1">
        <Link
          href="/auth/signup"
          className={`rounded-full py-2 text-center font-syne text-sm font-semibold transition-colors ${
            pathname === "/auth/signup" ? "bg-clay text-ivory" : "text-muted hover:text-text"
          }`}
        >
          Create Account
        </Link>
        <Link
          href="/auth/login"
          className={`rounded-full py-2 text-center font-syne text-sm font-semibold transition-colors ${
            pathname === "/auth/login" ? "bg-clay text-ivory" : "text-muted hover:text-text"
          }`}
        >
          Sign In
        </Link>
      </div>

      <h1 className="mb-1 font-cinzel text-2xl text-text">Create your account</h1>
      <p className="mb-6 font-noto text-sm text-muted">Join readers across 54 countries.</p>

      <SocialButtons />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-muted2" />
        <span className="font-noto text-xs text-muted">or continue with email</span>
        <div className="h-px flex-1 bg-muted2" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              First name
            </label>
            <input
              className="input-base"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ada"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Last name
            </label>
            <input
              className="input-base"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Lovelace"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Email</label>
          <input
            type="email"
            className="input-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="input-base pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < strength ? meta.color : "bg-bg4"
                }`}
              />
            ))}
          </div>
          {password && <p className="mt-1 font-noto text-xs text-muted">{meta.label}</p>}
        </div>

        <p className="font-noto text-xs text-muted">
          By creating an account, you agree to ÍléOtaku&apos;s{" "}
          <Link href="/terms" className="text-gold hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-gold hover:underline">
            Privacy Policy
          </Link>
          . Some features — higher-resolution Feed posts, post boosts, and daily roulette — use
          coins, ÍléOtaku&apos;s virtual currency; coins are non-refundable and hold no cash value.
        </p>

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
        </button>
      </form>
    </div>
  );
}
