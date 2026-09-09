"use client";

import { useState } from "react";
import { UserCheck, UserPlus } from "lucide-react";

export interface AuthorFollowButtonProps {
  authorName: string;
}

/**
 * Follow toggle for a manga's listed author. MangaHook authors aren't real ÍléOtaku accounts,
 * so this is a lightweight local-only toggle rather than a real follow-graph edge — for
 * following actual ÍléOtaku creators see components/creator/FollowButton.tsx instead.
 */
export default function AuthorFollowButton({ authorName }: AuthorFollowButtonProps) {
  const [following, setFollowing] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFollowing((f) => !f)}
      className={following ? "btn-ghost" : "btn-primary"}
      aria-label={following ? `Unfollow ${authorName}` : `Follow ${authorName}`}
    >
      {following ? (
        <>
          <UserCheck className="h-4 w-4" /> Following
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" /> Follow
        </>
      )}
    </button>
  );
}
