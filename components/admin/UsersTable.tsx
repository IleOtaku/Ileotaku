"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  adminDeleteUserAccount,
  grantPlatinum,
  liftSuspension,
  makeCreator,
  makePublisher,
  permanentlyBanUser,
  removeAdminRole,
  revokePlatinum,
  suspendUserFor,
  unbanUser,
  unverifyUser,
  verifyCreator,
  verifyPublisher,
} from "@/lib/admin";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfileUrl } from "@/lib/utils";
import type { UserProfile } from "@/types";
import AddAdminRoleModal from "./AddAdminRoleModal";

const BAN_DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export interface UsersTableProps {
  users: UserProfile[];
  loading: boolean;
  /** Sub-Admins can moderate accounts but not grant/change admin roles — hides that action
   * from the dropdown and disables the "Admin" role badge from being editable at all. */
  canManageAdmins?: boolean;
  onUserUpdated: (uid: string, patch: Partial<UserProfile>) => void;
  /** Fired after a successful server-side account deletion — the row should disappear from the
   * table entirely (unlike onUserUpdated's in-place patch), since the account no longer exists
   * at all, Auth credential included. */
  onUserDeleted: (uid: string) => void;
}

const PAGE_SIZE = 20;

type PendingAction =
  | "grant-platinum"
  | "revoke-platinum"
  | "make-creator"
  | "verify-creator"
  | "make-publisher"
  | "verify-publisher"
  | "unverify"
  | "suspend"
  | "ban"
  | "unban"
  | "lift-suspension"
  | "remove-admin"
  | "delete-account";

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
export default function UsersTable({ users, loading, canManageAdmins = true, onUserUpdated, onUserDeleted }: UsersTableProps) {
  const { user: currentAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openMenuUid, setOpenMenuUid] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState<{ uid: string; action: PendingAction } | null>(null);
  const [adminModalUser, setAdminModalUser] = useState<UserProfile | null>(null);
  const [tempBanUser, setTempBanUser] = useState<UserProfile | null>(null);
  const [permBanUser, setPermBanUser] = useState<UserProfile | null>(null);
  const [banReason, setBanReason] = useState("");
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserProfile | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
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

  async function handleConfirmTempBan(days: number) {
    if (!tempBanUser) return;
    const until = new Date();
    until.setDate(until.getDate() + days);
    await runAction(tempBanUser, "suspend", () => suspendUserFor(tempBanUser.uid, days), {
      suspendedUntil: until.toISOString(),
    });
    setTempBanUser(null);
  }

  async function handleConfirmPermBan() {
    if (!permBanUser) return;
    await runAction(
      permBanUser,
      "ban",
      () => permanentlyBanUser(permBanUser.uid, permBanUser.email, "admin", banReason.trim() || undefined),
      { isBanned: true }
    );
    setPermBanUser(null);
    setBanReason("");
  }

  async function handleConfirmDelete() {
    if (!deleteUserTarget || !currentAdmin) return;
    if (deleteConfirmEmail.trim().toLowerCase() !== (deleteUserTarget.email ?? "").toLowerCase()) return;
    setPending({ uid: deleteUserTarget.uid, action: "delete-account" });
    try {
      await adminDeleteUserAccount(deleteUserTarget.uid, currentAdmin.uid);
      onUserDeleted(deleteUserTarget.uid);
      toast.success("Account deleted.");
      setDeleteUserTarget(null);
      setDeleteConfirmEmail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That account couldn't be deleted.");
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
                  ? "bg-yellow-900/20"
                  : "";
              const isBusy = pending?.uid === u.uid;

              return (
                <tr key={u.uid} className={`border-b border-bg4 last:border-0 ${rowTint}`}>
                  <td className="flex items-center gap-2.5 p-3">
                    <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={32} />
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
                <MenuItem
                  onClick={() => {
                    window.open(getUserProfileUrl(u), "_blank", "noopener,noreferrer");
                    setOpenMenuUid(null);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink className="h-3.5 w-3.5" /> View Profile
                  </span>
                </MenuItem>
                <div className="my-1 border-t border-bg4" />
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
                {u.isVerified && (
                  <MenuItem
                    onClick={() =>
                      runAction(u, "unverify", () => unverifyUser(u.uid), {
                        isVerified: false,
                        verifiedType: null,
                      })
                    }
                  >
                    Unverify
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
                {u.isBanned && (
                  <MenuItem
                    onClick={() => runAction(u, "unban", () => unbanUser(u.uid), { isBanned: false, suspendedUntil: undefined })}
                  >
                    Unban @{u.handle ?? u.displayName}
                  </MenuItem>
                )}
                {!u.isBanned && u.suspendedUntil && new Date(u.suspendedUntil) > new Date() && (
                  <MenuItem
                    onClick={() =>
                      runAction(u, "lift-suspension", () => liftSuspension(u.uid), { suspendedUntil: undefined })
                    }
                  >
                    Lift Suspension
                  </MenuItem>
                )}
                <MenuItem
                  danger
                  onClick={() => {
                    setTempBanUser(u);
                    setOpenMenuUid(null);
                  }}
                >
                  Temporary Ban
                </MenuItem>
                <MenuItem
                  danger
                  disabled={!canManageAdmins}
                  title={!canManageAdmins ? "Super Admin only" : undefined}
                  onClick={() => {
                    if (!canManageAdmins) return;
                    setPermBanUser(u);
                    setOpenMenuUid(null);
                  }}
                >
                  Permanent Ban{!canManageAdmins && " (Super Admin only)"}
                </MenuItem>
                <MenuItem
                  danger
                  disabled={!canManageAdmins}
                  title={!canManageAdmins ? "Super Admin only" : undefined}
                  onClick={() => {
                    if (!canManageAdmins) return;
                    setDeleteUserTarget(u);
                    setOpenMenuUid(null);
                  }}
                >
                  Delete Account{!canManageAdmins && " (Super Admin only)"}
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

      <Modal open={tempBanUser !== null} onClose={() => setTempBanUser(null)} title="Temporary Ban">
        <p className="mb-4 font-noto text-sm text-muted">
          Suspend <span className="font-semibold text-text">{tempBanUser?.displayName}</span> for:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BAN_DURATIONS.map((d) => (
            <button
              key={d.days}
              type="button"
              onClick={() => handleConfirmTempBan(d.days)}
              disabled={pending !== null}
              className="btn-ghost justify-center disabled:opacity-50"
            >
              {d.label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={permBanUser !== null}
        onClose={() => {
          setPermBanUser(null);
          setBanReason("");
        }}
        title="Permanent Ban"
      >
        <p className="mb-3 font-noto text-sm text-muted">
          <span className="font-semibold text-text">{permBanUser?.displayName}</span> will not be able to sign in
          again. This can be reversed later by an admin, but treat it as a serious action.
        </p>
        <textarea
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
          placeholder="Reason (optional, kept in the audit log)..."
          rows={3}
          className="input-base w-full resize-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setPermBanUser(null)} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmPermBan}
            disabled={pending !== null}
            className="rounded-lg bg-red-900 px-4 py-2 font-syne text-sm font-semibold text-red-100 hover:bg-red-800 disabled:opacity-50"
          >
            {pending?.action === "ban" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Permanent Ban"}
          </button>
        </div>
      </Modal>

      <Modal
        open={deleteUserTarget !== null}
        onClose={() => {
          setDeleteUserTarget(null);
          setDeleteConfirmEmail("");
        }}
        title="Delete Account"
      >
        <p className="mb-3 font-noto text-sm text-muted">
          This permanently deletes{" "}
          <span className="font-semibold text-text">{deleteUserTarget?.displayName}</span>&apos;s account —
          Firebase Auth credential, profile, posts, history, and every other piece of Firestore
          data. This cannot be undone and they will no longer be able to sign in at all.
        </p>
        <label htmlFor="delete-confirm-email" className="mb-1.5 block font-noto text-xs text-muted">
          Type <span className="font-semibold text-text">{deleteUserTarget?.email}</span> to confirm
        </label>
        <input
          id="delete-confirm-email"
          value={deleteConfirmEmail}
          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
          placeholder={deleteUserTarget?.email}
          autoComplete="off"
          className="input-base w-full"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDeleteUserTarget(null);
              setDeleteConfirmEmail("");
            }}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={
              pending !== null ||
              deleteConfirmEmail.trim().toLowerCase() !== (deleteUserTarget?.email ?? "").toLowerCase()
            }
            className="rounded-lg bg-red-900 px-4 py-2 font-syne text-sm font-semibold text-red-100 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending?.action === "delete-account" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Account"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`block w-full rounded-lg px-3 py-2 text-left font-noto text-xs hover:bg-bg4 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "text-clay2" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}
