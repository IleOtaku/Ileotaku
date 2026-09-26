"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { requestMotionPermission, startShakeDetection } from "@/lib/shakeDetector";
import FeedbackModal, { BETA_FEEDBACK_CUTOFF } from "./FeedbackModal";
import { ShakePermissionModal } from "./ShakePermissionModal";

const STORAGE_KEY = "ileotaku-shake-feedback";
const ASKED_KEY = "ileotaku-shake-asked";
const FIRST_PROMPT_DELAY_MS = 30_000;

/**
 * Beta feedback: "Shake to Report." Mounted once, globally, in app/layout.tsx — shaking the phone
 * anywhere in the app pops the same FeedbackModal the footer and Profile Settings use.
 *
 * Preference source of truth is layered: localStorage first (instant, no network), then this
 * account's own users/{uid}.shakeReportEnabled as a fallback for a fresh browser/private window
 * where localStorage was never set — Profile Settings' toggle keeps both in sync going forward via
 * the 'shake-preference-changed' event this component listens for. A visitor who's never touched
 * either is asked once, 30 seconds into their first visit; answering either way is remembered
 * forever after (`ileotaku-shake-asked`), so it's never asked twice.
 */
export function ShakeReporter() {
  const { user, profile } = useAuth();
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const initializedRef = useRef(false);

  const pastCutoff = new Date() >= BETA_FEEDBACK_CUTOFF;

  async function enableShake(): Promise<boolean> {
    // iOS 13+ requires this to be called from a real user gesture (a button tap) — both callers
    // here (the permission modal's Enable button, and Profile Settings' toggle onChange) are.
    const granted = await requestMotionPermission();
    if (!granted) {
      toast.error("Motion permission denied — shake disabled");
      return false;
    }
    cleanupRef.current?.();
    cleanupRef.current = startShakeDetection({
      threshold: 15,
      timeout: 1500,
      onShake: () => setShowFeedbackModal(true),
    });
    try {
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.setItem(ASKED_KEY, "true");
    } catch {
      // Best-effort — shake still works for this session even if it can't be remembered.
    }
    return true;
  }

  function disableShake() {
    cleanupRef.current?.();
    cleanupRef.current = null;
    try {
      localStorage.setItem(STORAGE_KEY, "false");
      localStorage.setItem(ASKED_KEY, "true");
    } catch {
      // Best-effort — see enableShake's own comment.
    }
  }

  // First-visit bootstrap: decide, once, whether to silently auto-enable (an existing saved
  // preference — localStorage first, this account's own Firestore doc as the fallback) or
  // schedule the permission prompt (nothing saved anywhere yet). Waits for `profile` to actually
  // finish loading before falling back to it, rather than racing ahead and treating "not loaded
  // yet" as "disabled".
  useEffect(() => {
    if (pastCutoff || initializedRef.current) return;
    let saved: string | null = null;
    let hasBeenAsked = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
      hasBeenAsked = localStorage.getItem(ASKED_KEY) === "true";
    } catch {
      // Inaccessible localStorage — treat as "nothing saved" below.
    }

    if (saved === "true") {
      initializedRef.current = true;
      enableShake();
      return;
    }
    if (saved === "false") {
      initializedRef.current = true;
      return;
    }
    if (user && !profile) return; // signed in, but this account's profile hasn't loaded yet
    if (profile?.shakeReportEnabled) {
      initializedRef.current = true;
      enableShake();
      return;
    }
    if (hasBeenAsked) {
      initializedRef.current = true;
      return;
    }
    initializedRef.current = true;
    const timer = setTimeout(() => setShowPermissionModal(true), FIRST_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pastCutoff, user, profile]);

  // Profile Settings' toggle dispatches this so every already-mounted ShakeReporter (this is
  // mounted once, globally, but the event keeps the pattern robust either way) picks up the
  // change immediately, with no reload needed.
  useEffect(() => {
    function onPreferenceChanged(e: Event) {
      const enabled = (e as CustomEvent<{ enabled: boolean }>).detail?.enabled;
      if (enabled) enableShake();
      else disableShake();
    }
    window.addEventListener("shake-preference-changed", onPreferenceChanged);
    return () => window.removeEventListener("shake-preference-changed", onPreferenceChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  if (pastCutoff) return null;

  async function handlePermissionEnable() {
    setShowPermissionModal(false);
    await enableShake();
  }

  function handlePermissionDisable() {
    disableShake();
    setShowPermissionModal(false);
  }

  return (
    <>
      {showPermissionModal && <ShakePermissionModal onEnable={handlePermissionEnable} onDisable={handlePermissionDisable} />}
      <FeedbackModal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
    </>
  );
}

export default ShakeReporter;
