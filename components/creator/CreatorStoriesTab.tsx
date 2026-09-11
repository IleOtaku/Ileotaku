"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { EmptyState, Skeleton } from "@/components/ui";
import { deleteStory, MAX_ACTIVE_STORIES, subscribeToStories } from "@/lib/stories";
import { formatTime } from "@/lib/utils";
import type { Story } from "@/types";

const StoryCreateModal = dynamic(() => import("@/components/stories/StoryCreateModal"), { ssr: false });

export interface CreatorStoriesTabProps {
  uid: string;
}

/** Creator dashboard's "Stories" tab (Sprint "Polish-2" Part 7): every one of the creator's own
 * currently-active stories (up to MAX_ACTIVE_STORIES), each with its own delete button — separate
 * from the home feed's StoriesBar, which is for VIEWING everyone's stories, not managing your own. */
export default function CreatorStoriesTab({ uid }: CreatorStoriesTabProps) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    return subscribeToStories((grouped) => setStories(grouped.get(uid) ?? []));
  }, [uid]);

  async function handleDelete(storyId: string) {
    setDeletingId(storyId);
    try {
      await deleteStory(storyId, uid);
      toast.success("Story deleted.");
    } catch {
      toast.error("Couldn't delete this story.");
    } finally {
      setDeletingId(null);
    }
  }

  if (stories === null) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[9/16] w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-noto text-xs text-muted">
          {stories.length} of {MAX_ACTIVE_STORIES} active stories
        </p>
        {stories.length < MAX_ACTIVE_STORIES && (
          <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> New Story
          </button>
        )}
      </div>

      {stories.length === 0 ? (
        <div className="mx-auto max-w-md py-12">
          <EmptyState
            icon={<span className="text-4xl">✨</span>}
            title="No Active Stories"
            description="Share a story to appear in your followers' story bar for 24 hours."
            action={
              <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> New Story
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stories.map((s) => (
            <div key={s.id} className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-bg3">
              {s.mediaType === "text" ? (
                <div className="flex h-full w-full items-center justify-center p-3" style={{ background: s.backgroundColor || "#1a1510" }}>
                  <p className="text-center font-cinzel text-sm text-white">{s.textContent}</p>
                </div>
              ) : s.mediaType === "video" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={s.mediaUrl} className="h-full w-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" src={s.mediaUrl} alt="" className="h-full w-full object-cover" />
              )}
              {s.mediaType === "video" && (
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white">
                  <Play className="h-3 w-3 fill-current" />
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="font-noto text-[10px] text-white/80">{formatTime(s.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                disabled={deletingId === s.id}
                aria-label="Delete story"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-clay disabled:opacity-60"
              >
                {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <StoryCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
