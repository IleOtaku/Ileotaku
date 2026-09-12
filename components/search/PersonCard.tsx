"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/social/MessageButton";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge } from "@/components/ui/Badges";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { getCreatorStats } from "@/lib/firestore";
import { truncate } from "@/lib/utils";
import type { UserProfile } from "@/types";

export interface PersonCardProps {
  person: UserProfile;
}

/** One People-tab / suggested-users result: avatar, badges, bio, follower count, and actions. */
export default function PersonCard({ person }: PersonCardProps) {
  const [stats, setStats] = useState<{ publishedCount: number; totalReads: number } | null>(null);
  const profileHref = person.isCreator && person.handle ? `/creator/${person.handle}` : `/profile/${person.uid}`;

  useEffect(() => {
    if (!person.isCreator) return;
    let cancelled = false;
    getCreatorStats(person.uid)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [person.isCreator, person.uid]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="flex items-start gap-3">
        <Link href={profileHref} className="shrink-0">
          <Avatar uid={person.uid} photoURL={person.photoURL} displayName={person.displayName} size={40} />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={profileHref} className="flex flex-wrap items-center gap-1.5">
            <span className="font-syne text-sm font-semibold text-text">{person.displayName}</span>
            <VerificationBadge user={person} size={16} />
            {person.foundingCreator && (
              <span className="badge-plat text-[10px]">
                <Sparkles className="h-2.5 w-2.5" /> Founding
              </span>
            )}
            <PlatinumBadge isPlatinum={person.isPlatinum} className="h-4 w-4" />
          </Link>
          {person.handle && <p className="font-noto text-xs text-muted">@{person.handle}</p>}
          {person.bio && (
            <p className="mt-1 font-noto text-xs text-muted">{truncate(person.bio, 90)}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-noto text-xs text-muted">
        <span>{(person.followers?.length ?? 0).toLocaleString()} followers</span>
        {person.isCreator && stats && (
          <>
            <span>{stats.publishedCount.toLocaleString()} series</span>
            <span>{stats.totalReads.toLocaleString()} reads</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <FollowButton targetUid={person.uid} initialFollowerCount={person.followers?.length ?? 0} hideCount />
        <MessageButton targetUid={person.uid} />
      </div>
    </div>
  );
}
