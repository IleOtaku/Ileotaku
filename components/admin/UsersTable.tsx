"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  grantPlatinum,
  makeCreator,
  makePublisher,
  permanentlyBanUser,
  removeAdminRole,
  revokePlatinum,
  suspendUserFor,
  verifyCreator,
  verifyPublisher,
} from "@/lib/admin";
import { initials, stringToColor } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import type { UserProfile } from "@/types";
import AddAdminRoleModal from "./AddAdminRoleModal";

export interface UsersTableProps {
  users: UserProfile[];
  loading: boolean;
  /** Sub-Admins can moderate accounts but not grant/change admin roles — hides that action
   * from the dropdown and disables the "Admin" role badge from being editable at all. */
  canManageAdmins?: boolean;
  onUserUpdated: (uid: string, patch: Partial<UserProfile>) => void;
}

const PAGE_SIZE = 20;

type PendingAction =
  | "grant-platinum"
  | "revoke-platinum"
  | "make-creator"
  | "verify-creator"
  | "make-publisher"
  | "verify-publisher"
  | "suspend"
  | "ban"
  | "remove-admin";

function RoleBadges({ user }: { user: UserProfile }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.isPlatinum && <span className="badge-plat text-[10px]">Platinum</span>}
      {user.isCreator && (
        <span className="flex items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-green2">
          <BadgeCheck className="h-3 w-3" /> Creator
        </span>
      )}
      {user.isPublisher && (
        <span className="rounded-full bg-purple-500/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-purple-300">
          Publisher
        </span>
      )}
      {user.isAdmin && (
        <span className="flex items-center gap-1 rounded-full bg-plat/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-plat2">
          <ShieldCheck className="h-3 w-3" /> {user.adminType ? user.adminType : "super"} admin
        </span>
      )}
      {user.isBanned && (
        <span className="rounded-full bg-red-900/60 px-2 py-0.5 font-noto text-[10px] font-bold text-red-200">
          Banned
        </span>
      )}
    </div>
  );
}

/**
 * Full user management table for the admin Users tab: search, role badges, per-row moderation
 * actions, and 20-per-page pagination. All moderation writes go through lib/admin.ts and patch
 * the parent's user list in place via onUserUpdated rather than triggering a full refetch.
 */
export default function UsersTable({ users, loading, canManageAdmins = true, onUserUpdated }: UsersTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openMenuUid, setOpenMenuUid] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState<{ uid: string; action: PendingAction } | null>(null);
  const [adminModalUser, setAdminModalUser] = useState<UserProfile | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The dropdown is rendered via a portal to <body> (see UserActionsMenu below) so it's never
  // clipped by the table's `overflow-x-auto` wrapper — setting only overflow-x forces
  // overflow-y to an implicit "auto" per the CSS spec, which was silently cutting the menu off.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target)) return;
      if (target.closest("[data-user-actions-trigger]")) return;
      setOpenMenuUid(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleMenu(uid: string, triggerEl: HTMLButtonElement) {
    if (openMenuUid === uid) {
      setOpenMenuUid(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX - 224 });
    setOpenMenuUid(uid);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const handle = u.handleLower ?? u.handle?.toLowerCase() ?? "";
      const name = u.displayNameLower ?? u.displayName?.toLowerCase() ?? "";
      const email = u.email?.toLowerCase() ?? "";
      return handle.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  async function runAction(user: UserProfile, action: PendingAction, fn: () => Promise<void>, patch: Partial<UserProfile>) {
    setPending({ uid: user.uid, action });
    setOpenMenuUid(null);
    try {
      await fn();
      onUserUpdated(user.uid, patch);
      toast.success("Updated.");
    } catch {
      toast.error("That action couldn't be completed.");
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search name, email, or @handle..."
          className="input-base pl-9 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-bg4">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-bg4 bg-bg2">
              {["User", "Email", "Roles", "Joined", "Last active", ""].map((h) => (
                <th key={h} className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((u) => {
              const rowTint = u.isBanned
                ? "bg-red-950/40"
                : u.suspendedUntil && new Date(u.suspendedUntil) > new Date()
                  ? "bg-red-950/15"
                  : "";
              const isBusy = pending?.uid === u.uid;

              return (
                <tr key={u.uid} className={`border-b border-bg4 last:border-0 ${rowTint}`}>
                  <td className="flex items-center gap-2.5 p-3">
                    {u.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
            loading="lazy"
                        src={u.photoURL}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
                        style={{ backgroundColor: stringToColor(u.uid || u.displayName) }}
                      >
                        {initials(u.displayName)}
                      </span>
                    )}
                    <span className="font-noto text-sm text-text">{u.displayName}</span>
                  </td>
                  <td className="p-3 font-noto text-xs text-muted">{u.email}</td>
                  <td className="p-3">
                    <RoleBadges user={u} />
                  </td>
                  <td className="whitespace-nowrap p-3 font-noto text-xs text-muted">
                    {u.createdAt && !Number.isNaN(new Date(u.createdAt).getTime())
                      ? new Date(u.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap p-3 font-noto text-xs text-muted">
                    {u.updatedAt && !Number.isNaN(new Date(u.updatedAt).getTime())
                      ? new Date(u.updatedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      data-user-actions-trigger
                      onClick={(e) => toggleMenu(u.uid, e.currentTarget)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-muted2 px-2.5 py-1.5 font-noto text-xs text-text hover:border-gold disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Actions"}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center font-noto text-sm text-muted">
                  No users match &quot;{search}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between font-noto text-xs text-muted">
        <span>
          {filtered.length === 0 ? 0 : pageSafe * PAGE_SIZE + 1}–
          {Math.min((pageSafe + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={pageSafe === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-muted2 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            Page {pageSafe + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageSafe >= totalPages - 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-muted2 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {openMenuUid &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const u = pageItems.find((item) => item.uid === openMenuUid);
            if (!u) return null;
            return (
              <div
                ref={menuRef}
                className="glass fixed z-50 w-56 overflow-hidden rounded-xl p-1.5 text-left"
                style={{ top: menuPos.top, left: Math.max(8, menuPos.left) }}
              >
                {u.isPlatinum ? (
                  <MenuItem onClick={() => runAction(u, "revoke-platinum", () => revokePlatinum(u.uid), { isPlatinum: false })}>
                    Revoke Platinum
                  </MenuItem>
                ) : (
                  <MenuItem onClick={() => runAction(u, "grant-platinum", () => grantPlatinum(u.uid), { isPlatinum: true })}>
                    Grant Platinum
                  </MenuItem>
                )}
                {!u.isCreator && (
                  <MenuItem onClick={() => runAction(u, "make-creator", () => makeCreator(u.uid), { isCreator: true })}>
                    Make Creator
                  </MenuItem>
                )}
                {u.isCreator && u.verifiedType !== "creator" && (
                  <MenuItem
                    onClick={() =>
                      runAction(u, "verify-creator", () => verifyCreator(u.uid), {
                        isVerified: true,
                        verifiedType: "creator",
                      })
                    }
                  >
                    Verify Creator
                  </MenuItem>
                )}
                {!u.isPublisher && (
                  <MenuItem onClick={() => runAction(u, "make-publisher", () => makePublisher(u.uid), { isPublisher: true })}>
                    Make Publisher
                  </MenuItem>
                )}
                {u.isPublisher && u.verifiedType !== "publisher" && (
                  <MenuItem
                    onClick={() =>
                      runAction(u, "verify-publisher", () => verifyPublisher(u.uid), {
                        isVerified: true,
                        verifiedType: "publisher",
                      })
                    }
                  >
                    Verify Publisher
                  </MenuItem>
                )}

                {canManageAdmins && (
                  <>
                    <div className="my-1 border-t border-bg4" />
                    {u.isAdmin ? (
                      <MenuItem
                        danger
                        onClick={() =>
                          runAction(u, "remove-admin", () => removeAdminRole(u.uid), {
                            isAdmin: false,
                            adminType: undefined,
                          })
                        }
                      >
                        Remove Admin
                      </MenuItem>
                    ) : (
                      <MenuItem
                        onClick={() => {
                          setAdminModalUser(u);
                          setOpenMenuUid(null);
                        }}
                      >
                        Add as Admin
                      </MenuItem>
                    )}
                  </>
                )}

                <div className="my-1 border-t border-bg4" />
                <MenuItem
                  danger
                  onClick={() =>
                    runAction(u, "suspend", () => suspendUserFor(u.uid, 7), {
                      suspendedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
                    })
                  }
                >
                  Suspend 7 days
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => runAction(u, "ban", () => permanentlyBanUser(u.uid, u.email, "admin"), { isBanned: true })}
                >
                  Permanent Ban
                </MenuItem>
              </div>
            );
          })(),
          document.body
        )}

      <AddAdminRoleModal
        open={adminModalUser !== null}
        onClose={() => setAdminModalUser(null)}
        user={adminModalUser}
        onDone={(uid, adminType) => onUserUpdated(uid, { isAdmin: true, adminType })}
      />
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2 text-left font-noto text-xs hover:bg-bg4 ${
        danger ? "text-clay2" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}
