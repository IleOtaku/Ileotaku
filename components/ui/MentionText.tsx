"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { getUserByHandle } from "@/lib/firestore";
import { getUserProfileUrl } from "@/lib/utils";

const MENTION_PATTERN = /(@\w+)/g;

export interface MentionTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain message/comment text with any `@handle` tokens highlighted in plat purple and
 * made clickable — used everywhere free-text is shown back to a reader: DM threads (direct and
 * group), series/chapter comments, and the reader's live chat. A click looks the handle up
 * (getUserByHandle) and navigates to that account's profile; a handle that doesn't resolve to a
 * real account (the mention was typed freehand, or the account was since renamed/deleted) is a
 * silent no-op rather than a broken link.
 */
export default function MentionText({ text, className }: MentionTextProps) {
  const router = useRouter();
  const parts = text.split(MENTION_PATTERN);

  async function goToMention(handle: string) {
    const profile = await getUserByHandle(handle).catch(() => null);
    if (profile) router.push(getUserProfileUrl(profile));
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("@") && part.length > 1 ? (
          <span
            key={i}
            role="link"
            tabIndex={0}
            onClick={() => goToMention(part.slice(1))}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToMention(part.slice(1));
            }}
            className="cursor-pointer font-semibold text-plat hover:underline"
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </span>
  );
}
