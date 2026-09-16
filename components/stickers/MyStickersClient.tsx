"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { getOwnedPacksWithStickers } from "@/lib/stickers";
import type { StickerItem, StickerPack } from "@/types";

/** PART 6 — "Manage My Stickers": every pack the signed-in user owns, with a way to remove one
 * from their collection (the pack itself is untouched — this only removes the ownership doc). */
export default function MyStickersClient() {
  const { user } = useAuth();
  const [packs, setPacks] = useState<{ pack: StickerPack; stickers: StickerItem[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getOwnedPacksWithStickers(user.uid).then((result) => {
      if (!cancelled) {
        setPacks(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleRemove(packId: string) {
    if (!user) return;
    if (!window.confirm("Remove this pack from your collection?")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "stickerPacks", packId));
      setPacks((prev) => prev.filter((p) => p.pack.id !== packId));
    } catch {
      toast.error("Couldn't remove this pack.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/stickers" className="mb-4 flex items-center gap-1.5 font-noto text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Sticker Store
      </Link>
      <h1 className="mb-6 font-cinzel text-2xl text-text">My Stickers</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : packs.length === 0 ? (
        <p className="py-16 text-center font-noto text-sm text-muted">
          You don&apos;t own any sticker packs yet — visit the Sticker Store to add some.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {packs.map(({ pack, stickers }) => (
            <div key={pack.id} className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-syne text-sm font-semibold text-text">{pack.name}</p>
                  <p className="font-noto text-xs text-muted">by {pack.artist}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(pack.id)}
                  aria-label="Remove pack"
                  className="rounded-full p-2 text-muted hover:bg-clay/10 hover:text-clay2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {stickers.map((s) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} loading="lazy" src={s.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
