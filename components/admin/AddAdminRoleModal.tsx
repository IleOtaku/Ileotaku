"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { addAdminRole } from "@/lib/admin";
import type { AdminType, UserProfile } from "@/types";

export interface AddAdminRoleModalProps {
  open: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onDone: (uid: string, adminType: AdminType) => void;
}

const ROLE_OPTIONS: { label: string; value: AdminType; description: string }[] = [
  { label: "Sub-Admin", value: "sub", description: "Everything Super Admin sees except Finance and Announcements." },
  { label: "Accountant", value: "accountant", description: "Finance dashboard only — revenue, payouts, transactions." },
  { label: "Technical", value: "technical", description: "Error logs, bug reports, maintenance, API health." },
  { label: "Community", value: "community", description: "Redirected to the Creator Studio — no admin console." },
];

/** Role picker for granting an existing user one of the four non-super admin consoles. */
export default function AddAdminRoleModal({ open, onClose, user, onDone }: AddAdminRoleModalProps) {
  const [saving, setSaving] = useState<AdminType | null>(null);

  async function handlePick(role: AdminType) {
    if (!user) return;
    setSaving(role);
    try {
      await addAdminRole(user.uid, role);
      toast.success(`${user.displayName} is now a ${ROLE_OPTIONS.find((r) => r.value === role)?.label}.`);
      onDone(user.uid, role);
      onClose();
    } catch {
      toast.error("Couldn't update this admin role.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user ? `Make ${user.displayName} an admin` : "Add admin"}>
      <div className="flex flex-col gap-2">
        {ROLE_OPTIONS.map((role) => (
          <button
            key={role.value}
            type="button"
            onClick={() => handlePick(role.value)}
            disabled={saving !== null}
            className="flex items-center justify-between gap-3 rounded-xl border border-bg4 bg-bg2 px-4 py-3 text-left transition-colors hover:border-clay disabled:opacity-50"
          >
            <span>
              <span className="block font-syne text-sm font-semibold text-text">{role.label}</span>
              <span className="block font-noto text-xs text-muted">{role.description}</span>
            </span>
            {saving === role.value && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
