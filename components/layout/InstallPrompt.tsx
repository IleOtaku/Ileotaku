"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const VISIT_COUNT_KEY = "ileotaku-visit-count";
const DISMISSED_UNTIL_KEY = "ileotaku-install-dismissed-until";
const DISMISS_DAYS = 30;
const VISITS_BEFORE_PROMPT = 3;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  // Standalone (already installed) shouldn't show the prompt again.
  const isStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIOS && !isStandalone;
}

function isAlreadyStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Bottom install banner: waits for a visitor's 3rd visit (tracked in localStorage) before
 * showing anything, then either the real `beforeinstallprompt` flow (Chrome/Edge/Android) or,
 * on iOS Safari where that event never fires, manual "Tap Share → Add to Home Screen"
 * instructions. A dismissal is remembered for 30 days.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isAlreadyStandalone()) return;

    let count = 0;
    try {
      count = Number(localStorage.getItem(VISIT_COUNT_KEY) ?? "0") + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(count));
    } catch {
      return;
    }

    function dismissedRecently(): boolean {
      try {
        const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
        return until !== null && Date.now() < Number(until);
      } catch {
        return false;
      }
    }

    if (count < VISITS_BEFORE_PROMPT || dismissedRecently()) return;

    if (isIOSSafari()) {
      setIosMode(true);
      setVisible(true);
      return;
    }

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Non-fatal — worst case the banner reappears next visit.
    }
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="glass flex w-full max-w-md items-center gap-3 rounded-2xl p-4 shadow-2xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clay/15 font-cinzel text-lg font-bold text-gold">
          Í
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-syne text-sm font-semibold text-text">
            Add to your home screen for the best experience
          </p>
          {iosMode && (
            <p className="mt-1 flex items-center gap-1 font-noto text-xs text-muted">
              Tap <Share className="h-3.5 w-3.5" /> Share → Add to Home Screen
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!iosMode && (
            <button type="button" onClick={handleInstall} className="btn-primary px-3 py-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
