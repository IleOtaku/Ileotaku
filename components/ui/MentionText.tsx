"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { getUserByHandle } from "@/lib/firestore";
import { getUserProfileUrl } from "@/lib/utils";

// Captures @mentions and http(s) URLs in one pass so a single text.split() interleaves both
// kinds of tokens with the plain-text runs between them, in original order.
const TOKEN_PATTERN = /(@\w+|https?:\/\/[^\s]+)/g;

/** Beta feedback: "Links should be ... formatted to be shorter" — a real URL-shortening service
 * is out of scope here, but a long raw URL dominating a DM bubble is its own readability problem
 * this can solve directly: show a trimmed label while the `href` still points at the full URL. */
function shortenUrlLabel(url: string): string {
  if (url.length <= 42) return url;
  try {
    const { hostname, pathname } = new URL(url);
    const tail = pathname.length > 1 ? `${pathname.slice(0, 20)}…` : "";
    return `${hostname}${tail}`;
  } catch {
    return `${url.slice(0, 39)}…`;
  }
}

export interface MentionTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain message/comment text with any `@handle` tokens highlighted in plat purple and
 * made clickable, and any `http(s)://` URL made into a real clickable link (opened in a new tab,
 * with a shortened label — see shortenUrlLabel) — used everywhere free-text is shown back to a
 * reader: DM threads (direct and group), series/chapter comments, and the reader's live chat. An
 * @mention click looks the handle up (getUserByHandle) and navigates to that account's profile; a
 * handle that doesn't resolve to a real account (typed freehand, or since renamed/deleted) is a
 * silent no-op rather than a broken link.
 */
export default function MentionText({ text, className }: MentionTextProps) {
  const router = useRouter();
  const parts = text.split(TOKEN_PATTERN);

  async function goToMention(handle: string) {
    const profile = await getUserByHandle(handle).catch(() => null);
    if (profile) router.push(getUserProfileUrl(profile));
  }

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@") && part.length > 1) {
          return (
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
          );
        }
        if (part.startsWith("http://") || part.startsWith("https://")) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-plat underline decoration-plat/40 underline-offset-2 hover:decoration-plat"
            >
              {shortenUrlLabel(part)}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
