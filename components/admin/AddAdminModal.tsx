"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Search, ShieldX } from "lucide-react";
import { addAdminRole, getAllAdmins, removeAdminRole, getUserByEmail } from "@/lib/admin";
import { Modal } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import type { AdminType, UserProfile } from "@/types";

export interface AddAdminModalProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS: { label: string; value: AdminType }[] = [
  { label: "Sub-Admin", value: "sub" },
  { label: "Accountant", value: "accountant" },
  { label: "Technical", value: "technical" },
  { label: "Community", value: "community" },
];

/** Overview quick action: find a user by email, grant them an admin role, and manage the
 * current admin roster — separate from UsersTable's per-row "Add as Admin" shortcut, since
 * this one is meant for when you don't already have the user in front of you in the table. */
export default function AddAdminModal({ open, onClose }: AddAdminModalProps) {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<UserProfile | null | undefined>(undefined);
  const [role, setRole] = useState<AdminType>("sub");
  const [confirming, setConfirming] = useState(false);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setFound(undefined);
    setAdminsLoading(true);
    getAllAdmins()
      .then(setAdmins)
      .catch(() => setAdmins([]))
      .finally(() => setAdminsLoading(false));
  }, [open]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSearching(true);
    setFound(undefined);
    try {
      const user = await getUserByEmail(email.trim());
      setFound(user);
      if (!user) toast.error("No user found with that email.");
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleConfirm() {
    if (!found) return;
    setConfirming(true);
    try {
      await addAdminRole(found.uid, role);
      toast.success(`${found.displayName} is now a ${ROLE_OPTIONS.find((r) => r.value === role)?.label}.`);
      setAdmins((prev) => [...prev.filter((a) => a.uid !== found.uid), { ...found, isAdmin: true, adminType: role }]);
      setFound(undefined);
      setEmail("");
    } catch {
      toast.error("Couldn't grant this role.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleRemove(uid: string) {
    setRemovingUid(uid);
    try {
      await removeAdminRole(uid);
      setAdmins((prev) => prev.filter((a) => a.uid !== uid));
      toast.success("Admin access removed.");
    } catch {
      toast.error("Couldn't remove this admin.");
    } finally {
      setRemovingUid(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an admin">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            type="email"
            className="input-base pl-9 text-sm"
          />
        </div>
        <button type="submit" disabled={searching || !email.trim()} className="btn-ghost text-sm disabled:opacity-50">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {found === null && (
        <p className="mt-3 font-noto text-sm text-muted">No user found with that email.</p>
      )}

      {found && (
        <div className="mt-4 rounded-xl border border-bg4 bg-bg3 p-3">
          <div className="flex items-center gap-2.5">
            <Avatar uid={found.uid} photoURL={found.photoURL} displayName={found.displayName} size={32} />
            <div className="min-w-0">
              <p className="truncate font-syne text-sm font-semibold text-text">{found.displayName}</p>
              <p className="truncate font-noto text-xs text-muted">{found.email}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                  role === opt.value ? "border-clay bg-clay text-ivory" : "border-muted2 text-muted hover:text-text"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="btn-primary mt-3 w-full text-sm disabled:opacity-50"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : `Make ${found.displayName} ${ROLE_OPTIONS.find((r) => r.value === role)?.label}`}
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-bg4 pt-4">
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Current admins</p>
        {adminsLoading ? (
          <p className="font-noto text-xs text-muted">Loading...</p>
        ) : admins.length === 0 ? (
          <p className="font-noto text-xs text-muted">No admins yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {admins.map((a) => (
              <div key={a.uid} className="flex items-center justify-between gap-2 rounded-lg bg-bg3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-noto text-xs font-semibold text-text">{a.displayName}</span>
                  <span className="block truncate font-noto text-[10px] text-muted">{a.adminType ?? "super"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(a.uid)}
                  disabled={removingUid === a.uid}
                  aria-label={`Remove ${a.displayName}'s admin access`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-clay2 hover:bg-bg4 disabled:opacity-50"
                >
                  {removingUid === a.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
