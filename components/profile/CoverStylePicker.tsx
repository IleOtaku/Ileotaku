"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, Palette } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile, updateUserPrefs } from "@/lib/firestore";
import type { CoverStyleId } from "@/types";

export interface CoverStyleOption {
  id: CoverStyleId;
  label: string;
  /** Tailwind gradient classes applied to the banner element. */
  className: string;
}

export const COVER_STYLES: CoverStyleOption[] = [
  { id: "default", label: "Default Dark", className: "bg-gradient-to-br from-clay via-bg2 to-green" },
  { id: "clay", label: "Clay", className: "bg-gradient-to-br from-clay2 via-clay to-bg3" },
  { id: "gold", label: "Gold", className: "bg-gradient-to-br from-gold2 via-gold to-bg3" },
  { id: "green", label: "Green", className: "bg-gradient-to-br from-green2 via-green to-bg3" },
  { id: "plat", label: "Platinum", className: "bg-gradient-to-br from-plat2 via-plat to-bg3" },
  { id: "purple", label: "Deep Purple", className: "bg-gradient-to-br from-[#a78bfa] via-[#6d28d9] to-bg3" },
];

const COVER_STYLE_MAP: Record<CoverStyleId, string> = Object.fromEntries(
  COVER_STYLES.map((s) => [s.id, s.className])
) as Record<CoverStyleId, string>;

/** Resolves a saved coverStyle id to its Tailwind gradient classes — used for the picker's own
 * swatch buttons only. The actual profile banner can't use these (see COVER_GRADIENTS below). */
export function getCoverClassName(id: CoverStyleId | undefined): string {
  return COVER_STYLE_MAP[id ?? "default"] ?? COVER_STYLE_MAP.default;
}

/**
 * Raw CSS gradients, one per preset — for the profile banner itself rather than the picker
 * swatches above. The banner already layers a subtle grid-line pattern on top via an inline
 * `backgroundImage`, and an inline style's `background-image` always wins over a Tailwind
 * class's (same CSS property, higher specificity) — so a Tailwind `bg-gradient-to-br` class
 * placed on that same element would be silently invisible, fully replaced by the grid pattern.
 * Keeping the gradient as a plain string lets the banner compose it into ONE inline
 * `backgroundImage` alongside the grid lines instead.
 */
export const COVER_GRADIENTS: Record<CoverStyleId, string> = {
  default: "linear-gradient(135deg, #c4622d, #121009 55%, #3d6b4f)",
  clay: "linear-gradient(135deg, #e07840, #c4622d 55%, #1a1510)",
  gold: "linear-gradient(135deg, #f0c96a, #d4a843 55%, #1a1510)",
  green: "linear-gradient(135deg, #4e8a64, #3d6b4f 55%, #1a1510)",
  plat: "linear-gradient(135deg, #c8e8f8, #9ecfef 55%, #1a1510)",
  purple: "linear-gradient(135deg, #a78bfa, #6d28d9 55%, #1a1510)",
};

export function getCoverGradient(id: CoverStyleId | undefined): string {
  return COVER_GRADIENTS[id ?? "default"] ?? COVER_GRADIENTS.default;
}

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
