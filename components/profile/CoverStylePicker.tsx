"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, Palette } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile, updateUserPrefs } from "@/lib/firestore";
import { COVER_STYLES } from "@/lib/coverStyles";
import type { CoverStyleId } from "@/types";

// The actual data/helpers live in lib/coverStyles.ts (plain, no "use client") — re-exported here
// for backward compatibility with anything still importing them from this path. See that
// file's own comment for why: a Server Component importing a plain function from a "use
// client" module throws under `next dev` (confirmed live), even though the function itself
// uses no client-only APIs.
export { COVER_GRADIENTS, COVER_STYLES, getCoverClassName, getCoverGradient, type CoverStyleOption } from "@/lib/coverStyles";

export interface CoverStylePickerProps {
  open: boolean;
  onClose: () => void;
}

/** Six-preset picker for the profile banner's background gradient — saves directly to
 * Firestore's `coverStyle` field on the user's profile. */
export default function CoverStylePicker({ open, onClose }: CoverStylePickerProps) {
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState<CoverStyleId | null>(null);
  const current = profile?.coverStyle ?? "default";

  async function handleSelect(id: CoverStyleId) {
    if (!user || saving) return;
    setSaving(id);
    try {
      await updateUserPrefs(user.uid, { coverStyle: id });
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Cover updated!");
      onClose();
    } catch {
      toast.error("Couldn't update your cover. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a Cover">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {COVER_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => handleSelect(style.id)}
            disabled={saving !== null}
            className={`relative h-16 overflow-hidden rounded-xl border-2 transition-colors ${style.className} ${
              current === style.id ? "border-gold" : "border-transparent hover:border-muted2"
            }`}
          >
            {current === style.id && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg/70">
                <Check className="h-3 w-3 text-gold" />
              </span>
            )}
            {saving === style.id && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-ivory" />
              </span>
            )}
            <span className="absolute bottom-1 left-2 font-syne text-[10px] font-semibold text-ivory drop-shadow">
              {style.label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 font-noto text-xs text-muted">
        <Palette className="h-3.5 w-3.5" /> Pick a preset to change your profile banner.
      </p>
    </Modal>
  );
}
