"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getNotificationPermissionStatus, requestNotificationPermission } from "@/lib/fcm";

const DISMISSED_UNTIL_KEY = "ileotaku-notif-prompt-dismissed-until";
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
    return until !== null && Date.now() < Number(until);
  } catch {
    return false;
  }
}

/**
 * Subtle "Enable notifications" banner shown to a signed-in reader who hasn't been asked yet
 * (browser permission still "default") and hasn't dismissed this specific prompt in the last 7
 * days — same dismiss-and-remember pattern as InstallPrompt, just a shorter window since this is
 * a lighter ask. Enabling calls the same requestNotificationPermission() the profile Settings
 * tab's own toggle uses, so either path leaves fcmTokens in the same state.
 */
export default function NotificationPrompt() {
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      setVisible(false);
      return;
    }
    if (getNotificationPermissionStatus() !== "default") return;
    if (dismissedRecently()) return;
    setVisible(true);
  }, [loading, user]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Non-fatal — worst case the banner reappears sooner than 7 days.
    }
  }

  async function handleEnable() {
    if (!user) return;
    setRequesting(true);
    try {
      const status = await requestNotificationPermission(user.uid);
      if (status === "granted") toast.success("Notifications enabled!");
      else if (status === "denied") toast.error("Notifications were blocked.");
    } catch {
      toast.error("Couldn't enable notifications. Please try again.");
    } finally {
      setRequesting(false);
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="glass flex w-full max-w-md items-center gap-3 rounded-2xl p-4 shadow-2xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-syne text-sm font-semibold text-text">
            Enable notifications to know when creators post new chapters
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={dismiss}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={requesting}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}
