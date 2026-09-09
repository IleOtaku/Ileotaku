"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Coins, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { tipCreator } from "@/lib/payments";
import { initials, stringToColor } from "@/lib/utils";

export interface TipModalProps {
  open: boolean;
  onClose: () => void;
  /** The real ÍléOtaku uid to credit. Null when the "creator" isn't a real account yet (e.g. a
   * MangaHook-sourced author) — the modal still opens but tipping is disabled with an explanation. */
  creatorId: string | null;
  creatorName: string;
  mangaId?: string;
}

const PRESET_AMOUNTS = [5, 10, 25, 50, 100];

/** Tipping modal: preset/custom coin amount, balance check, calls tipCreator on send. */
export default function TipModal({ open, onClose, creatorId, creatorName, mangaId }: TipModalProps) {
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [sending, setSending] = useState(false);

  const balance = profile?.coins ?? 0;
  const effectiveAmount = customAmount ? Number(customAmount) || 0 : amount;
  const insufficientBalance = effectiveAmount > balance;

  async function handleSend() {
    if (!user || !creatorId || effectiveAmount <= 0) return;
    setSending(true);
    try {
      const result = await tipCreator(user.uid, creatorId, effectiveAmount, mangaId);
      if (result.success) {
        toast.success("Creator has been tipped! 🎉");
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
        onClose();
      } else {
        toast.error(result.message ?? "Couldn't send this tip.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send a Tip">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-syne text-sm font-bold text-ivory"
            style={{ backgroundColor: stringToColor(creatorName) }}
          >
            {initials(creatorName)}
          </span>
          <div>
            <p className="font-syne text-sm font-semibold text-text">{creatorName}</p>
            <p className="font-noto text-xs text-muted">Your tip goes straight to this creator.</p>
          </div>
        </div>

        {!creatorId ? (
          <p className="rounded-lg border border-dashed border-muted2 bg-bg3 p-3 font-noto text-xs text-muted">
            This creator hasn&apos;t set up direct tips yet — check back once they join ÍléOtaku.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(preset);
                    setCustomAmount("");
                  }}
                  className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                    !customAmount && amount === preset
                      ? "border-clay bg-clay text-ivory"
                      : "border-muted2 bg-bg3 text-muted"
                  }`}
                >
                  {preset} 🪙
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Custom amount
              </label>
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Enter coin amount"
                className="input-base"
              />
            </div>

            <div className="flex items-center justify-between font-noto text-xs text-muted">
              <span>Your balance</span>
              <span className="flex items-center gap-1 text-gold2">
                <Coins className="h-3.5 w-3.5" /> {balance.toLocaleString()}
              </span>
            </div>

            {insufficientBalance && (
              <p className="rounded-lg border border-clay/30 bg-clay/10 p-3 font-noto text-xs text-clay2">
                Not enough coins for this tip.{" "}
                <Link href="/pricing#coins" className="underline">
                  Get more coins
                </Link>
                .
              </p>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={sending || insufficientBalance || effectiveAmount <= 0 || !user}
              className="btn-primary w-full justify-center"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Send ${effectiveAmount} 🪙 Tip`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
