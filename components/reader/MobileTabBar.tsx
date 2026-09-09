"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookMarked, Compass, Flame, Home, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeToUnreadDMCount } from "@/lib/dms";
import { subscribeToNotifications } from "@/lib/notifications";

export interface MobileTabBarProps {
  browseOpen: boolean;
  onToggleBrowse: () => void;
}

/**
 * The reader's mobile-only bottom navigation: Home / Browse / Library / Profile. Padded for
 * the phone's home-indicator safe area. Profile carries a combined unread badge (notifications
 * + DMs) so it doubles as the "you have something waiting" tab, same as the desktop Navbar.
 */
export default function MobileTabBar({ browseOpen, onToggleBrowse }: MobileTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadDMs, setUnreadDMs] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    return subscribeToNotifications(user.uid, (snapshot) => setUnreadNotifications(snapshot.unreadCount));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadDMs(0);
      return;
    }
    return subscribeToUnreadDMCount(user.uid, setUnreadDMs);
  }, [user]);

  const profileBadge = unreadNotifications + unreadDMs;
  const isHome = pathname === "/";

  const tabs = [
    {
      key: "home",
      label: "Home",
      icon: Home,
      active: isHome,
      onClick: () => router.push("/"),
    },
    {
      key: "browse",
      label: "Browse",
      icon: Compass,
      active: browseOpen,
      onClick: onToggleBrowse,
    },
    {
      key: "library",
      label: "Library",
      icon: BookMarked,
      active: false,
      onClick: () => router.push("/profile?tab=library"),
    },
    {
      key: "feed",
      label: "Feed",
      icon: Flame,
      active: pathname === "/feed",
      onClick: () => router.push("/feed"),
    },
    {
      key: "profile",
      label: "Profile",
      icon: UserIcon,
      active: false,
      badge: profileBadge,
      onClick: () => router.push("/profile"),
    },
  ] as const;

  return (
    <div
      className="flex items-center justify-around border-t border-bg4 bg-bg2 px-2 pt-2 md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            aria-label={tab.label}
            aria-pressed={tab.active}
            className={`relative flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition-colors ${
              tab.active ? "text-clay2" : "text-muted"
            }`}
          >
            <Icon className={`h-5 w-5 ${tab.active ? "fill-clay/20" : ""}`} />
            <span className="font-noto text-[10px] font-medium">{tab.label}</span>
            {"badge" in tab && tab.badge > 0 && (
              <span className="absolute right-1 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-clay px-1 font-syne text-[10px] font-bold text-ivory">
                {tab.badge > 9 ? "9+" : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
