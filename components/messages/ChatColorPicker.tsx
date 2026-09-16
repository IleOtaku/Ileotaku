"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Lock } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { setConversationBubbleColor, setUserDmPreference } from "@/lib/dms";
import { contrastTextColor } from "@/lib/utils";

export interface ChatColorPickerProps {
  open: boolean;
  onClose: () => void;
  /** Present only when opened from a specific conversation's DM Settings. */
  conversationId?: string;
}

const SOLID_COLORS = [
  "#c4622d", "#d4a843", "#3d6b4f", "#9ecfef", "#7c3aed", "#a855f7", "#3b82f6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#6366f1", "#8b5cf6",
  "#d946ef", "#f43f5e", "#84cc16", "#10b981", "#0ea5e9", "#64748b", "#78716c", "#57534e",
  "#1c1917", "#292524", "#44403c", "#e7e5e4", "#f5f5f4", "#ffffff",
];

const GRADIENTS = [
  "linear-gradient(135deg,#c4622d,#d4a843)", "linear-gradient(135deg,#3d6b4f,#22c55e)",
  "linear-gradient(135deg,#9ecfef,#3b82f6)", "linear-gradient(135deg,#7c3aed,#a855f7)",
  "linear-gradient(135deg,#ec4899,#f43f5e)", "linear-gradient(135deg,#c4622d,#7c3aed)",
  "linear-gradient(135deg,#d4a843,#ef4444)", "linear-gradient(135deg,#3d6b4f,#9ecfef)",
  "linear-gradient(135deg,#6366f1,#8b5cf6)", "linear-gradient(135deg,#14b8a6,#3b82f6)",
  "linear-gradient(135deg,#f97316,#eab308)", "linear-gradient(135deg,#d946ef,#7c3aed)",
  "linear-gradient(135deg,#84cc16,#22c55e)", "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#c4622d,#3d6b4f)", "linear-gradient(135deg,#f43f5e,#d4a843)",
  "linear-gradient(135deg,#9ecfef,#a855f7)", "linear-gradient(135deg,#10b981,#0ea5e9)",
  "linear-gradient(135deg,#292524,#78716c)", "linear-gradient(135deg,#7c3aed,#3b82f6)",
];

/** DM Feature Overhaul (Part D): 30 solid swatches + 20 gradients + custom hex/two-color pickers,
 * a live bubble preview, and Universal/This-chat-only — same shape as BubbleStylePicker. */
export default function ChatColorPicker({ open, onClose, conversationId }: ChatColorPickerProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<"solid" | "gradient">("solid");
  const [scope, setScope] = useState<"universal" | "chat">("universal");
  const [customHex, setCustomHex] = useState("#c4622d");
  const [gradientStart, setGradientStart] = useState("#c4622d");
  const [gradientEnd, setGradientEnd] = useState("#d4a843");
  const [saving, setSaving] = useState(false);
  const isPlatinum = profile?.isPlatinum === true;
  const currentColor = profile?.dmPreferences?.bubbleColor;

  async function applyColor(color: string) {
    if (!user) return;
    setSaving(true);
    try {
      if (scope === "chat" && conversationId) {
        await setConversationBubbleColor(conversationId, user.uid, color);
        toast.success("Bubble color updated for this chat.");
      } else {
        await setUserDmPreference(user.uid, "bubbleColor", color);
        await setUserDmPreference(user.uid, "universalBubble", true);
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
        toast.success("Bubble color updated everywhere.");
      }
      onClose();
    } catch {
      toast.error("Couldn't save your bubble color.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bubble Color" zIndex={140}>
      {!isPlatinum ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Lock className="h-8 w-8 text-muted" />
          <p className="font-noto text-sm text-muted">Custom bubble colors are a Platinum perk.</p>
          <Link href="/pricing" className="btn-plat">
            Upgrade to Platinum
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="flex h-14 items-center justify-center rounded-2xl font-noto text-sm"
            style={{
              background: tab === "gradient" ? `linear-gradient(135deg,${gradientStart},${gradientEnd})` : customHex,
              color: contrastTextColor(tab === "solid" ? customHex : undefined),
            }}
          >
            Preview message
          </div>

          {conversationId && (
            <div className="flex gap-1 rounded-full bg-bg3 p-1">
              <button
                type="button"
                onClick={() => setScope("universal")}
                className={`flex-1 rounded-full py-1.5 font-syne text-xs font-semibold ${scope === "universal" ? "bg-clay text-ivory" : "text-muted"}`}
              >
                Universal
              </button>
              <button
                type="button"
                onClick={() => setScope("chat")}
                className={`flex-1 rounded-full py-1.5 font-syne text-xs font-semibold ${scope === "chat" ? "bg-clay text-ivory" : "text-muted"}`}
              >
                This chat only
              </button>
            </div>
          )}

          <div className="flex gap-1 rounded-full bg-bg3 p-1">
            <button
              type="button"
              onClick={() => setTab("solid")}
              className={`flex-1 rounded-full py-1.5 font-syne text-xs font-semibold ${tab === "solid" ? "bg-clay text-ivory" : "text-muted"}`}
            >
              Solid Colors
            </button>
            <button
              type="button"
              onClick={() => setTab("gradient")}
              className={`flex-1 rounded-full py-1.5 font-syne text-xs font-semibold ${tab === "gradient" ? "bg-clay text-ivory" : "text-muted"}`}
            >
              Gradients
            </button>
          </div>

          {tab === "solid" ? (
            <>
              <div className="grid grid-cols-6 gap-2">
                {SOLID_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applyColor(c)}
                    disabled={saving}
                    aria-label={c}
                    className={`h-8 w-8 rounded-full border-2 disabled:opacity-60 ${currentColor === c ? "border-clay" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent"
                />
                <input
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="input-base flex-1 text-sm"
                  placeholder="#c4622d"
                />
                <button type="button" onClick={() => applyColor(customHex)} disabled={saving} className="btn-primary shrink-0 text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => applyColor(g)}
                    disabled={saving}
                    aria-label="Gradient swatch"
                    className={`h-8 w-full rounded-full border-2 disabled:opacity-60 ${currentColor === g ? "border-clay" : "border-transparent"}`}
                    style={{ background: g }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gradientStart}
                  onChange={(e) => setGradientStart(e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent"
                />
                <input
                  type="color"
                  value={gradientEnd}
                  onChange={(e) => setGradientEnd(e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => applyColor(`linear-gradient(135deg,${gradientStart},${gradientEnd})`)}
                  disabled={saving}
                  className="btn-primary flex-1 text-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Custom Gradient"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
