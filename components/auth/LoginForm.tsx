"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { friendlyError, resetPassword, signInEmail } from "@/lib/auth";
import SocialButtons from "./SocialButtons";

/** Login form: account/sign-in mode tabs, social buttons, email/password with an inline forgot-password flow. */
export default function LoginForm() {
  const pathname = usePathname();
  const router = useRouter();

  const [view, setView] = useState<"login" | "reset">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signInEmail(email.trim(), password);
      toast.success("Welcome back!");
      router.push("/reader");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    setResetSubmitting(true);
    try {
      await resetPassword(resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setResetSubmitting(false);
    }
  }

  if (view === "reset") {
    return (
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => {
            setView("login");
            setResetSent(false);
          }}
          className="mb-6 flex items-center gap-1.5 font-syne text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </button>

        <h1 className="mb-1 font-cinzel text-2xl text-text">Reset your password</h1>
        <p className="mb-6 font-noto text-sm text-muted">
          {resetSent
            ? "Check your inbox for a link to reset your password."
            : "Enter the email on your account and we'll send you a reset link."}
        </p>

        {!resetSent && (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Email
              </label>
              <input
                type="email"
                className="input-base"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button type="submit" disabled={resetSubmitting} className="btn-primary mt-2 w-full">
              {resetSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </button>
          </form>
        )}
      </div>
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

      <h1 className="mb-1 font-cinzel text-2xl text-text">Welcome back</h1>
      <p className="mb-6 font-noto text-sm text-muted">Sign in to keep reading.</p>

      <SocialButtons />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-muted2" />
        <span className="font-noto text-xs text-muted">or continue with email</span>
        <div className="h-px flex-1 bg-muted2" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-syne text-xs font-semibold text-muted">Password</label>
            <button
              type="button"
              onClick={() => setView("reset")}
              className="font-noto text-xs text-gold hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="input-base pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
        </div>

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
        </button>
      </form>

      <p className="mt-8 text-center font-noto text-xs text-muted">
        Signing in as an ÍléOtaku admin? Use your admin email above — the console unlocks
        automatically.
      </p>
    </div>
  );
}
