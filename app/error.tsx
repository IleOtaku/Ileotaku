"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "@/lib/errorLogger";

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Navbar, kente-bar, and Footer are already applied automatically by SiteChrome around every
// non-immersive route — this file only needs the centered "something broke" content, matching
// not-found.tsx's layout.
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logError(error, { operation: "app/error.tsx boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 30%, #c4622d, transparent 45%), radial-gradient(circle at 70% 70%, #d4a843, transparent 45%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <span className="animate-float text-6xl">⚠️</span>
        <h1 className="mt-6 font-cinzel text-3xl text-gold sm:text-4xl">Something Went Wrong</h1>
        <p className="mt-3 max-w-sm font-noto text-sm text-muted">
          Our team has been notified. Please try refreshing.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try Again
          </button>
          <Link href="/" className="btn-ghost">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
