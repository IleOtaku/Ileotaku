/**
 * Pure cover-style data/helpers, deliberately kept OUT of components/profile/CoverStylePicker.tsx
 * (which re-exports these for backward compatibility) despite conceptually belonging there.
 *
 * Reason: CoverStylePicker.tsx is a "use client" file (it uses useState/useAuth for the picker
 * UI itself). Confirmed live that importing a plain, non-component export — getCoverGradient —
 * from a "use client" module into a Server Component (app/creator/[handle]/page.tsx,
 * app/profile/[uid]/page.tsx) throws "getCoverGradient is not a function" specifically under
 * `next dev` — Next.js's dev-mode RSC module federation replaces every export of a client
 * module with a lazy client-reference stub, including plain functions/constants that have
 * nothing to do with the client boundary, not just the actual React component. `next build`
 * happens to optimize this case away in production, which is why it was never caught until a
 * dev-mode walkthrough. The correct fix — not a workaround — is what this file does: pure
 * data with no hooks or browser APIs has no reason to live in a "use client" module in the
 * first place, regardless of the dev/prod discrepancy that exposed it.
 */
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
