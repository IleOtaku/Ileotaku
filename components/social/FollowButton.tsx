"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, UserCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import { followUser, unfollowUser } from "@/lib/social";

export interface FollowButtonProps {
  targetUid: string;
  /** Seed count from the server render — updated optimistically as the button is toggled. */
  initialFollowerCount?: number;
  /** Hide the follower-count label (e.g. tight toolbar layouts). */
  hideCount?: boolean;
}

/** Reusable follow/unfollow control for a real ÍléOtaku account, backed by lib/social.ts. */
export default function FollowButton({
  targetUid,
  initialFollowerCount = 0,
  hideCount,
}: FollowButtonProps) {
  const { user, profile } = useAuth();
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  useEffect(() => {
    setFollowing(profile?.following?.includes(targetUid) ?? false);
  }, [profile, targetUid]);

  if (!user || user.uid === targetUid) {
    return null;
  }

  async function handleClick() {
    if (!user) return;
    setPending(true);
    try {
      if (following) {
        await unfollowUser(user.uid, targetUid);
        setFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await followUser(user.uid, targetUid);
        setFollowing(true);
        setFollowerCount((c) => c + 1);
      }
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={following ? "btn-ghost" : "btn-primary"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : following ? (
          <>
            <UserCheck className="h-4 w-4" /> Following
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" /> Follow
          </>
        )}
      </button>
      {!hideCount && (
        <span className="font-noto text-xs text-muted">
          {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
