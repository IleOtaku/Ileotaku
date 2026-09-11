"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { isThisWeek, isToday } from "date-fns";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { markAllAsRead, markAsRead, subscribeToNotifications } from "@/lib/notifications";
import { formatTime } from "@/lib/utils";
import { NotificationType, type AppNotification } from "@/types";

const TYPE_EMOJI: Record<NotificationType, string> = {
  [NotificationType.NEW_CHAPTER]: "📖",
  [NotificationType.COMMENT_REPLY]: "💬",
  [NotificationType.COMMENT_LIKE]: "❤️",
  [NotificationType.COINS_RECEIVED]: "🪙",
  [NotificationType.PLATINUM_EXPIRING]: "⏳",
  [NotificationType.PLATINUM_EXPIRED]: "💔",
  [NotificationType.WORK_APPROVED]: "✅",
  [NotificationType.WORK_REJECTED]: "❌",
  [NotificationType.NEW_FOLLOWER]: "👤",
  [NotificationType.ANNOUNCEMENT]: "📢",
  [NotificationType.ROULETTE_REMINDER]: "🎡",
  [NotificationType.STREAK_WARNING]: "🔥",
  [NotificationType.ACHIEVEMENT_UNLOCKED]: "🏆",
  [NotificationType.EARNINGS_MILESTONE]: "💰",
  [NotificationType.BADGE_APPROVED]: "🏅",
  [NotificationType.MODERATION_ACTION]: "🚫",
  [NotificationType.GROUP_ADDED]: "👥",
  [NotificationType.GROUP_MENTION]: "📣",
  [NotificationType.OWNERSHIP_TRANSFER_REQUEST]: "🔄",
  [NotificationType.OWNERSHIP_TRANSFER_ACCEPTED]: "✅",
  [NotificationType.APPEAL_APPROVED]: "🎉",
  [NotificationType.APPEAL_DENIED]: "🚫",
  [NotificationType.RESTRICTION_LIFTED]: "🔓",
};

type GroupLabel = "Today" | "This Week" | "Earlier";

function groupLabelFor(createdAt: string): GroupLabel {
  const date = new Date(createdAt);
  if (isToday(date)) return "Today";
  if (isThisWeek(date)) return "This Week";
  return "Earlier";
}

interface NotificationItemProps {
  notification: AppNotification;
  onClick: () => void;
}

/** One row in the dropdown — memoized since the list re-renders on every unread-count change
 * (the real-time subscription), even though almost no individual row's own data actually changed. */
const NotificationItem = memo(function NotificationItem({ notification: n, onClick }: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg4"
    >
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: n.isRead ? "transparent" : "#c4622d" }}
      />
      {n.imageURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          src={n.imageURL}
          alt=""
          className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-lg leading-none">
          {TYPE_EMOJI[n.type] ?? "🔔"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-syne text-sm font-semibold text-text">{n.title}</span>
        <span className="block truncate font-noto text-xs text-muted">{n.body}</span>
        <span className="block font-noto text-[10px] text-muted/70">{formatTime(n.createdAt)}</span>
      </span>
    </button>
  );
});

/** Bell icon + unread badge for the Navbar, with a real-time dropdown of the latest notifications. */
export default function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    return subscribeToNotifications(user.uid, (snapshot) => {
      setNotifications(snapshot.notifications);
      setUnreadCount(snapshot.unreadCount);
    });
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  async function handleItemClick(n: AppNotification) {
    setOpen(false);
    if (!n.isRead) {
      try {
        await markAsRead(user!.uid, n.id);
      } catch {
        // Navigation still proceeds even if the read-receipt write fails.
      }
    }
    router.push(n.actionURL);
  }

  async function handleMarkAllRead() {
    if (!user) return;
    try {
      await markAllAsRead(user.uid);
    } catch {
      // Non-fatal — the panel just stays as-is if the batch write couldn't go through.
    }
  }

  const groups: { label: GroupLabel; items: AppNotification[] }[] = (
    ["Today", "This Week", "Earlier"] as GroupLabel[]
  )
    .map((label) => ({
      label,
      items: notifications.filter((n) => groupLabelFor(n.createdAt) === label),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text/80 transition-colors hover:bg-bg3 hover:text-gold"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-clay px-1 font-syne text-[10px] font-bold text-ivory">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass absolute right-0 z-50 mt-2 w-[380px] max-w-[90vw] overflow-hidden rounded-xl"
          >
            <div className="flex items-center justify-between border-b border-bg4 px-4 py-3">
              <h3 className="font-cinzel text-sm text-gold">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="font-syne text-xs text-muted hover:text-gold"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="text-2xl">✓</span>
                  <p className="font-cinzel text-sm text-text">All Caught Up</p>
                  <p className="font-noto text-xs text-muted">No new notifications</p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <p className="px-4 pb-1 pt-3 font-syne text-[10px] font-bold uppercase tracking-wide text-muted">
                      {group.label}
                    </p>
                    {group.items.map((n) => (
                      <NotificationItem key={n.id} notification={n} onClick={() => handleItemClick(n)} />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
