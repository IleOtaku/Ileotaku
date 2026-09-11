"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import {
  getVisitorCount,
  isVisitorRevealActive,
  purchaseVisitorReveal,
  subscribeToVisitors,
  type ProfileVisitor,
} from "@/lib/profileVisits";
import { formatTime } from "@/lib/utils";
import type { UserProfile } from "@/types";

interface VisitorRow extends ProfileVisitor {
  profile: UserProfile | null;
}

/** "Who Viewed Your Profile" — shown only on the signed-in user's own profile, between the stats
 * strip and the tabs. Real-time via subscribeToVisitors so a fresh visit appears without a
 * refresh. Anonymous entries (a Platinum visitor with hideProfileVisits on) stay a grey
 * silhouette + relative time until the owner spends coins to reveal the 3 most recent ones. */
export default function ProfileVisitorsSection() {
  const { user } = useAuth();
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [revealActive, setRevealActive] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getVisitorCount(user.uid).then(setWeeklyCount);
    isVisitorRevealActive(user.uid, user.uid).then(setRevealActive);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToVisitors(user.uid, (raw) => {
      Promise.all(
        raw.map(async (v) => ({
          ...v,
          profile: v.isAnonymous ? null : await getUserProfile(v.visitorUid).catch(() => null),
        }))
      ).then((rows) => {
        setVisitors(rows);
        setLoaded(true);
      });
    });
    return unsub;
  }, [user]);

  if (!user || !loaded || visitors.length === 0) return null;

  const anonymousCount = visitors.filter((v) => v.isAnonymous).length;
  const shown = expanded ? visitors : visitors.slice(0, 3);

  async function handleReveal() {
    if (!user) return;
    setRevealing(true);
    try {
      const result = await purchaseVisitorReveal(user.uid, user.uid);
      if (result.success) {
        setRevealActive(true);
        toast.success("Visitors revealed for the next 24 hours!");
      } else {
        toast.error(result.message ?? "Couldn't reveal your visitors.");
      }
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-bg4 bg-bg2 p-5">
      <p className="font-syne text-sm font-semibold text-text">
        👁 {weeklyCount.toLocaleString()} {weeklyCount === 1 ? "person" : "people"} visited your
        profile this week
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {shown.map((v) => {
          const isKnown = !v.isAnonymous || revealActive;
          const name = isKnown ? v.profile?.displayName ?? "Someone" : "Someone";
          const row = (
            <div className="flex items-center gap-3">
              {isKnown && v.profile ? (
                <Avatar uid={v.profile.uid} photoURL={v.profile.photoURL} displayName={v.profile.displayName} size={36} />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg4 text-muted">
                  <UserRound className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-syne text-sm font-semibold text-text">
                  {isKnown && v.profile ? name : "Someone viewed your profile"}
                </span>
                <span className="block font-noto text-xs text-muted">{formatTime(v.visitedAt)}</span>
              </span>
            </div>
          );
          return isKnown && v.profile ? (
            <Link key={v.visitorUid} href={`/profile/${v.visitorUid}`} className="transition-opacity hover:opacity-80">
              {row}
            </Link>
          ) : (
            <div key={v.visitorUid}>{row}</div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!expanded && visitors.length > 3 && (
          <button type="button" onClick={() => setExpanded(true)} className="font-syne text-xs text-muted hover:text-gold">
            See all visitors
          </button>
        )}
        {anonymousCount > 0 && !revealActive && (
          <button
            type="button"
            onClick={handleReveal}
            disabled={revealing}
            className="btn-ghost ml-auto text-xs disabled:opacity-60"
          >
            Reveal anonymous visitors — 10 🪙
          </button>
        )}
      </div>
    </div>
  );
}
