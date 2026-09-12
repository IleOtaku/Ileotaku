"use client";

import { useEffect, useState } from "react";
import { Play, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useAuth } from "@/hooks/useAuth";
import { MAX_ACTIVE_STORIES, subscribeToStories } from "@/lib/stories";
import type { Story } from "@/types";
import StoryCreateModal from "./StoryCreateModal";
import StoryViewer from "./StoryViewer";

/** Horizontal-scroll row at the very top of the home feed: your own story circle first (a "+"
 * if you have none, your own ring if you do), then everyone you follow who has an active story,
 * most-recently-posted first. A gold ring means you haven't watched it yet; muted once you have. */
export default function StoriesBar() {
  const { user, profile } = useAuth();
  const [grouped, setGrouped] = useState<Map<string, Story[]>>(new Map());
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingUid, setViewingUid] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToStories(setGrouped);
  }, []);

  if (!user) return null;

  const myStories = grouped.get(user.uid) ?? [];
  const followingUids = profile?.following ?? [];
  const otherUidsWithStories = Array.from(grouped.keys())
    .filter((uid) => uid !== user.uid && followingUids.includes(uid))
    .sort((a, b) => {
      const aLatest = grouped.get(a)?.at(-1)?.createdAt ?? "";
      const bLatest = grouped.get(b)?.at(-1)?.createdAt ?? "";
      return aLatest < bLatest ? 1 : -1;
    });

  const orderedUidsForViewer = [user.uid, ...otherUidsWithStories].filter((uid) => (grouped.get(uid)?.length ?? 0) > 0);

  function hasUnwatched(stories: Story[]): boolean {
    return stories.some((s) => !s.viewedBy.includes(user!.uid));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      <button
        type="button"
        onClick={() => (myStories.length > 0 ? setViewingUid(user.uid) : setCreateOpen(true))}
        className="flex w-16 shrink-0 flex-col items-center gap-1.5"
      >
        <span
          className={`relative flex h-16 w-16 items-center justify-center rounded-full ${
            myStories.length > 0 ? (hasUnwatched(myStories) ? "ring-2 ring-gold" : "ring-2 ring-muted2") : ""
          }`}
        >
          <Avatar uid={user.uid} photoURL={profile?.photoURL ?? user.photoURL ?? undefined} displayName={profile?.displayName ?? "You"} size={56} />
          {myStories.length > 1 && (
            <span className="absolute -left-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-bg bg-gold px-1 font-syne text-[10px] font-bold text-bg">
              {myStories.length}
            </span>
          )}
          {myStories.length < MAX_ACTIVE_STORIES && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setCreateOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setCreateOpen(true);
                }
              }}
              className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg bg-clay text-ivory"
            >
              <Plus className="h-3 w-3" />
            </span>
          )}
        </span>
        <span className="max-w-[64px] truncate font-noto text-[11px] text-muted">Your Story</span>
      </button>

      {otherUidsWithStories.map((uid) => {
        const stories = grouped.get(uid) ?? [];
        const latest = stories[stories.length - 1];
        return (
          <button
            key={uid}
            type="button"
            onClick={() => setViewingUid(uid)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <span className={`relative flex h-16 w-16 items-center justify-center rounded-full ${hasUnwatched(stories) ? "ring-2 ring-gold" : "ring-2 ring-muted2"}`}>
              <Avatar uid={uid} photoURL={latest?.photoURL} displayName={latest?.displayName ?? "Reader"} size={56} />
              {stories.length > 1 && (
                <span className="absolute -left-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-bg bg-gold px-1 font-syne text-[10px] font-bold text-bg">
                  {stories.length}
                </span>
              )}
              {latest?.mediaType === "video" && (
                <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg bg-bg text-text">
                  <Play className="h-2.5 w-2.5 fill-current" />
                </span>
              )}
            </span>
            <span className="flex max-w-[64px] items-center gap-0.5 font-noto text-[11px] text-muted">
              <span className="truncate">{latest?.displayName ?? "Reader"}</span>
              <VerificationBadge user={latest} size={10} />
            </span>
          </button>
        );
      })}

      <StoryCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {viewingUid && (
        <StoryViewer
          uids={orderedUidsForViewer}
          startUid={viewingUid}
          storiesByUid={grouped}
          onClose={() => setViewingUid(null)}
          onAddYourOwn={() => {
            setViewingUid(null);
            setCreateOpen(true);
          }}
        />
      )}
    </div>
  );
}
