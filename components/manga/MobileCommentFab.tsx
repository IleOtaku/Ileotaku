"use client";

import { MessageCircle } from "lucide-react";

export interface MobileCommentFabProps {
  commentCount: number;
}

/**
 * Mobile-only pill FAB, bottom-right, that smooth-scrolls to the #comments section.
 * Sits above the safe-area inset; hidden on md+ where the comment section is already
 * reachable in the normal two-column layout without needing a shortcut.
 */
export default function MobileCommentFab({ commentCount }: MobileCommentFabProps) {
  function handleClick() {
    document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Jump to comments (${commentCount})`}
      className="fixed bottom-6 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-clay px-4 font-syne text-sm font-semibold text-ivory shadow-2xl transition-transform active:scale-95 md:hidden"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="rounded-full bg-ivory/20 px-2 py-0.5 text-xs">
        {commentCount > 999 ? "999+" : commentCount}
      </span>
    </button>
  );
}
