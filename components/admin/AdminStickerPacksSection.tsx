"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, X } from "lucide-react";
import { approveStickerPack, getPendingStickerPacks, rejectStickerPack } from "@/lib/stickers";
import type { StickerPack } from "@/types";

/** PART 6 — Sticker packs, admin review queue. Sits at the top of the admin Feed tab rather than
 * as its own top-level admin tab — a lighter-weight placement given how much else that top-level
 * tab bar already carries (see final report for the disclosed trade-off). */
export default function AdminStickerPacksSection() {
  const [pending, setPending] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getPendingStickerPacks()
      .then(setPending)
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(packId: string) {
    setBusyId(packId);
    try {
      await approveStickerPack(packId);
      setPending((prev) => prev.filter((p) => p.id !== packId));
      toast.success("Pack approved — now live in the store.");
    } catch {
      toast.error("Couldn't approve this pack.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(packId: string) {
    setBusyId(packId);
    try {
      await rejectStickerPack(packId);
      setPending((prev) => prev.filter((p) => p.id !== packId));
      toast.success("Pack rejected.");
    } catch {
      toast.error("Couldn't reject this pack.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
      <h3 className="mb-3 font-syne text-sm font-semibold text-gold2">
        Sticker Packs Awaiting Review ({pending.length})
      </h3>
      <div className="flex flex-col gap-3">
        {pending.map((pack) => (
          <div key={pack.id} className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg2 p-3">
            <div className="flex gap-1">
              {pack.previewUrls.slice(0, 3).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} loading="lazy" src={url} alt="" className="h-10 w-10 rounded-lg bg-bg3 object-contain" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-syne text-sm font-semibold text-text">{pack.name}</p>
              <p className="truncate font-noto text-xs text-muted">
                by {pack.creatorName ?? pack.artist} · {pack.stickerCount} stickers ·{" "}
                {pack.price === 0 ? "Free" : `${pack.price} coins`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleReject(pack.id)}
              disabled={busyId === pack.id}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-clay2 hover:bg-clay/10"
              aria-label="Reject"
            >
              {busyId === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => handleApprove(pack.id)}
              disabled={busyId === pack.id}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-green2 hover:bg-green/10"
              aria-label="Approve"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
