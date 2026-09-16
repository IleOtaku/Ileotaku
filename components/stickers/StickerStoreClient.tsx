"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Coins, Loader2, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { addFreePackToUser, getStorePacks, getUserOwnedPackIds, purchasePack } from "@/lib/stickers";
import type { StickerPack } from "@/types";

function PackCard({ pack, owned, onAdded }: { pack: StickerPack; owned: boolean; onAdded: (packId: string) => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!user || busy || owned) return;
    setBusy(true);
    try {
      if (pack.price === 0) {
        await addFreePackToUser(user.uid, pack.id);
        toast.success(`Added "${pack.name}"!`);
        onAdded(pack.id);
      } else {
        const result = await purchasePack(user.uid, pack.id);
        if (result.success) {
          toast.success(`Added "${pack.name}"!`);
          onAdded(pack.id);
        } else {
          toast.error(result.message ?? "Couldn't complete this purchase.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-4">
      <div className="flex gap-1.5">
        {pack.previewUrls.slice(0, 3).map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} loading="lazy" src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ))}
      </div>
      <div>
        <p className="font-syne text-sm font-semibold text-text">{pack.name}</p>
        <p className="font-noto text-xs text-muted">
          by {pack.artist} · {pack.stickerCount} stickers
        </p>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={busy || owned}
        className={owned ? "btn-ghost justify-center text-sm" : "btn-primary justify-center text-sm"}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : owned ? (
          <>
            <Check className="h-4 w-4" /> Added
          </>
        ) : pack.price === 0 ? (
          "Add"
        ) : (
          <>
            <Coins className="h-4 w-4" /> {pack.price}
          </>
        )}
      </button>
    </div>
  );
}

/** PART 6 — Sticker Store: browse official free packs and coin-priced premium packs (official or
 * creator-submitted, once approved), and add them to your own collection. */
export default function StickerStoreClient() {
  const { user } = useAuth();
  const [free, setFree] = useState<StickerPack[]>([]);
  const [premium, setPremium] = useState<StickerPack[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getStorePacks(), user ? getUserOwnedPackIds(user.uid) : Promise.resolve([])]).then(
      ([{ free: freePacks, premium: premiumPacks }, owned]) => {
        if (cancelled) return;
        setFree(freePacks);
        setPremium(premiumPacks);
        setOwnedIds(new Set(owned));
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  function markOwned(packId: string) {
    setOwnedIds((prev) => new Set(prev).add(packId));
    // A purchase spends coins — refresh the cached profile so the navbar balance stays accurate.
    if (user) getUserProfile(user.uid).then((p) => useAuth.getState().setProfile(p));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-cinzel text-3xl text-text">Sticker Store 🎭</h1>
        <Link href="/stickers/my" className="btn-ghost text-sm">
          <Settings2 className="h-4 w-4" /> Manage My Stickers
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-4 font-syne text-lg font-semibold text-text">Free Packs</h2>
            {free.length === 0 ? (
              <p className="font-noto text-sm text-muted">No free packs available right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {free.map((pack) => (
                  <PackCard key={pack.id} pack={pack} owned={ownedIds.has(pack.id)} onAdded={markOwned} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 font-syne text-lg font-semibold text-text">Premium Packs</h2>
            {premium.length === 0 ? (
              <p className="font-noto text-sm text-muted">No premium packs yet — check back soon.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {premium.map((pack) => (
                  <PackCard key={pack.id} pack={pack} owned={ownedIds.has(pack.id)} onAdded={markOwned} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
