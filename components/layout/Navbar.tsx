"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Crown,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import MobileNavSearch from "@/components/layout/MobileNavSearch";
import NavSearch from "@/components/layout/NavSearch";
import NotificationBell from "@/components/layout/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/lib/auth";
import { subscribeToUnreadDMCount } from "@/lib/dms";
import { initials, stringToColor } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Browse", href: "/reader" },
  { label: "Explore", href: "/explore" },
  { label: "Feed", href: "/feed" },
  { label: "Pricing", href: "/pricing" },
  { label: "Creators", href: "/creator" },
];

/** Sticky site navbar with desktop links, an auth-aware user menu, and a slide-down mobile menu. */
export default function Navbar() {
  const { user, profile } = useAuth();
  const [mobilePanel, setMobilePanel] = useState<"menu" | "search" | null>(null);
  const mobileOpen = mobilePanel === "menu";
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadDMs, setUnreadDMs] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadDMs(0);
      return;
    }
    return subscribeToUnreadDMCount(user.uid, setUnreadDMs);
  }, [user]);

  const isPlatinum = profile?.isPlatinum === true;
  const isAdmin = profile?.isAdmin === true;
  const canModerate = profile?.isCreator === true || isAdmin;
  // profile.photoURL (Firestore, via this same Zustand store) rather than user.photoURL
  // (Firebase Auth) — see ProfileClient.tsx's handleAvatarChange for why: an avatar upload
  // optimistically updates profile.photoURL immediately, so this always reflects it without
  // waiting on the slower Firebase Auth round-trip.
  const avatarURL = profile?.photoURL ?? user?.photoURL ?? undefined;

  async function handleLogout() {
    setDropdownOpen(false);
    setMobilePanel(null);
    await logout();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-bg4 bg-bg/90 backdrop-blur">
      <div className="kente-bar" />
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-cinzel text-xl font-bold text-gold">
          <Image
            src="/icons/icon-32.png"
            alt="ÍléOtaku"
            width={28}
            height={28}
            className="h-6 w-6 rounded-md md:h-7 md:w-7"
          />
          Ílé<span className="text-clay">Otaku</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-syne text-sm text-text/80 transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <NavSearch />

        <div className="hidden items-center gap-3 md:flex">
          <NotificationBell />
          {/* Sprint 9e (13c): this was previously unconditional — found live, a genuine bug, not
              the "already hidden, just verify" the request assumed. Platinum members should see
              no subscription upsells anywhere on the platform (their own badge in the user menu
              below is the only remaining mention of their tier). */}
          {!isPlatinum && (
            <Link href="/pricing" className="btn-plat">
              <Crown className="h-4 w-4" />
              Go Platinum
            </Link>
          )}

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-muted2 bg-bg3 py-1.5 pl-1.5 pr-3 transition-colors hover:border-gold"
              >
                {avatarURL ? (
                  <Image
                    src={avatarURL}
                    alt={user.displayName ?? "avatar"}
                    width={28}
                    height={28}
                    unoptimized
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
                    style={{ backgroundColor: stringToColor(user.displayName ?? user.email ?? "U") }}
                  >
                    {initials(user.displayName ?? user.email ?? "U")}
                  </span>
                )}
                <span className="font-syne text-sm text-text">{user.displayName ?? "Reader"}</span>
                {isPlatinum && <span className="badge-plat">Platinum</span>}
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-xl p-1.5"
                  >
                    <Link
                      href="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 font-noto text-sm text-text hover:bg-bg4"
                    >
                      <UserIcon className="h-4 w-4" /> Profile
                    </Link>
                    <Link
                      href="/messages"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-noto text-sm text-text hover:bg-bg4"
                    >
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4" /> Messages
                      </span>
                      {unreadDMs > 0 && (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-clay px-1 font-syne text-[10px] font-bold text-ivory">
                          {unreadDMs > 9 ? "9+" : unreadDMs}
                        </span>
                      )}
                    </Link>
                    {canModerate && (
                      <Link
                        href="/creator"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 font-noto text-sm text-text hover:bg-bg4"
                      >
                        <LayoutDashboard className="h-4 w-4" /> Creator Studio
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 font-noto text-sm text-text hover:bg-bg4"
                      >
                        <ShieldCheck className="h-4 w-4" /> Admin
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-clay2 hover:bg-bg4"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="btn-ghost">
                Sign In
              </Link>
              <Link href="/auth/signup" className="btn-primary">
                Join Free
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <MobileNavSearch
            open={mobilePanel === "search"}
            onOpen={() => setMobilePanel("search")}
            onClose={() => setMobilePanel(null)}
          />
          <button
            type="button"
            onClick={() => setMobilePanel((p) => (p === "menu" ? null : "menu"))}
            className="flex h-9 w-9 items-center justify-center text-text"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-bg4 bg-bg2 md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobilePanel(null)}
                  className="rounded-lg px-3 py-2 font-syne text-sm text-text hover:bg-bg4"
                >
                  {link.label}
                </Link>
              ))}

              {!isPlatinum && (
                <Link
                  href="/pricing"
                  onClick={() => setMobilePanel(null)}
                  className="btn-plat mt-2 justify-center"
                >
                  <Crown className="h-4 w-4" /> Go Platinum
                </Link>
              )}

              {user ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMobilePanel(null)}
                    className="rounded-lg px-3 py-2 font-syne text-sm text-text hover:bg-bg4"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/messages"
                    onClick={() => setMobilePanel(null)}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-syne text-sm text-text hover:bg-bg4"
                  >
                    Messages
                    {unreadDMs > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-clay px-1 font-syne text-[10px] font-bold text-ivory">
                        {unreadDMs > 9 ? "9+" : unreadDMs}
                      </span>
                    )}
                  </Link>
                  {canModerate && (
                    <Link
                      href="/creator"
                      onClick={() => setMobilePanel(null)}
                      className="rounded-lg px-3 py-2 font-syne text-sm text-text hover:bg-bg4"
                    >
                      Creator Studio
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setMobilePanel(null)}
                      className="rounded-lg px-3 py-2 font-syne text-sm text-text hover:bg-bg4"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-3 py-2 text-left font-syne text-sm text-clay2 hover:bg-bg4"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <Link
                    href="/auth/login"
                    onClick={() => setMobilePanel(null)}
                    className="btn-ghost justify-center"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={() => setMobilePanel(null)}
                    className="btn-primary justify-center"
                  >
                    Join Free
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
