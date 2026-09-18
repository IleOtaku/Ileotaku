"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Loader2, Lock } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { setConversationBubbleStyle, setUserDmPreference } from "@/lib/dms";

export interface BubbleStylePickerProps {
  open: boolean;
  onClose: () => void;
  /** Present only when opened from a specific conversation's DM Settings — enables the
   * "This chat only" option. Opened from Settings → Platinum Perks (Part G), there's no
   * conversation in play, so that option is hidden and every pick is universal. */
  conversationId?: string;
}

const STYLE_COUNT = 10;

/** DM Feature Overhaul (Part C): grid of all 10 bubble-style previews (see globals.css's own
 * .bubble-style-N classes) with a Universal/This-chat-only toggle. Platinum-exclusive. */
export default function BubbleStylePicker({ open, onClose, conversationId }: BubbleStylePickerProps) {
  const { user, profile } = useAuth();
  const [scope, setScope] = useState<"universal" | "chat">("universal");
  const [saving, setSaving] = useState<number | null>(null);
  const isPlatinum = profile?.isPlatinum === true;
  const currentStyle = profile?.dmPreferences?.bubbleStyle ?? 1;
  const currentColor = profile?.dmPreferences?.bubbleColor;

  async function handlePick(style: number) {
    if (!user) return;
    setSaving(style);
    try {
      if (scope === "chat" && conversationId) {
        await setConversationBubbleStyle(conversationId, user.uid, style);
        toast.success("Bubble style updated for this chat.");
      } else {
        await setUserDmPreference(user.uid, "bubbleStyle", style);
        await setUserDmPreference(user.uid, "universalBubble", true);
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
        toast.success("Bubble style updated everywhere.");
      }
      onClose();
    } catch {
      toast.error("Couldn't save your bubble style.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bubble Style" zIndex={140}>
      {!isPlatinum ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Lock className="h-8 w-8 text-muted" />
          <p className="font-noto text-sm text-muted">Custom bubble styles are a Platinum perk.</p>
          <Link href="/pricing" className="btn-plat">
            Upgrade to Platinum
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: STYLE_COUNT }, (_, i) => i + 1).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => handlePick(style)}
                disabled={saving !== null}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors disabled:opacity-60 ${
                  currentStyle === style ? "border-clay bg-clay/10" : "border-bg4 bg-bg2 hover:border-muted2"
                }`}
              >
                <span className="relative flex h-10 w-full items-center justify-center">
                  <span
                    // The `message-bubble` class is required for globals.css's
                    // `.message-bubble.bubble-style-N` selectors to match at all — see
                    // MessagesClient.tsx's bubbleShape comment for why a bare `.bubble-style-N`
                    // selector by itself isn't enough.
                    className={`message-bubble bubble-style-${style} flex h-8 w-16 items-center justify-center bg-clay text-[10px] font-semibold text-ivory`}
                    style={currentColor ? { backgroundColor: currentColor } : undefined}
                  >
                    {saving === style && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  {currentStyle === style && (
                    <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-clay p-0.5 text-ivory" />
                  )}
                </span>
                <span className="font-noto text-[11px] text-muted">Style {style}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
