"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Coins, Loader2, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { proxyImg } from "@/lib/manga-api";
import { isChapterUnlocked, purchaseChapterWithCoins } from "@/lib/payments";

export interface CoinGateProps {
  mangaId: string;
  chapterId: string;
  previewImage: string;
  price: number;
  children: ReactNode;
}

/** Wraps a coin-locked chapter: blurred preview + unlock button until purchased, then the real content. */
export default function CoinGate({ mangaId, chapterId, previewImage, price, children }: CoinGateProps) {
  const { user, profile } = useAuth();
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    isChapterUnlocked(user.uid, chapterId).then((result) => {
      if (!cancelled) {
        setUnlocked(result);
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, chapterId]);

  async function handleUnlock() {
    if (!user) return;
    setUnlocking(true);
    try {
      const result = await purchaseChapterWithCoins(user, mangaId, chapterId, price);
      if (result.success) {
        setUnlocked(true);
        toast.success("Chapter unlocked!");
        const fresh = await getUserProfile(user.uid);
        useAuth.getState().setProfile(fresh);
      } else {
        toast.error(result.message ?? "Couldn't unlock this chapter.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }

  if (checking) {
    return <Skeleton className="aspect-[3/4] w-full rounded-xl" />;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  const balance = profile?.coins ?? 0;
  const insufficientBalance = balance < price;

  return (
    <div className="relative overflow-hidden rounded-xl border border-bg4 bg-bg2">
      <div className="aspect-[3/4] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            loading="lazy"
          src={proxyImg(previewImage)}
          alt="Locked chapter preview"
          className="h-full w-full scale-105 object-cover blur-md"
        />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/60 p-4 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Lock className="h-4 w-4" />
        </span>
        <p className="font-syne text-sm font-semibold text-text">Unlock for {price} coins</p>
        <p className="flex items-center gap-1 font-noto text-xs text-muted">
          <Coins className="h-3.5 w-3.5 text-gold2" /> Your balance: {balance.toLocaleString()}
        </p>
        {insufficientBalance ? (
          <Link href="/pricing#coins" className="btn-gold text-xs">
            Get more coins
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleUnlock}
            disabled={unlocking || !user}
            className="btn-gold text-xs"
          >
            {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : `Unlock for ${price} coins`}
          </button>
        )}
      </div>
    </div>
  );
}
