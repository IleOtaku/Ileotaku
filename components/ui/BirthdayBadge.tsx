import { isBirthdayToday } from "@/lib/birthday";

/**
 * Beta feedback: a birthday feature — "if today matches their birthday: show small 🎂 badge next
 * to their name everywhere... Only shows on their actual birthday — disappears next day." One
 * shared component so every render site (profile header, feed posts, comments, DMs, search
 * results) checks the exact same "MM-DD == today" logic (lib/birthday.ts's isBirthdayToday)
 * rather than each re-deriving it slightly differently.
 */
export function BirthdayBadge({ birthday, size = 14 }: { birthday?: string | null; size?: number }) {
  if (!isBirthdayToday(birthday)) return null;
  return (
    <span
      title="It's their birthday today! 🎂"
      className="inline-flex shrink-0 items-center"
      style={{ fontSize: size }}
    >
      🎂
    </span>
  );
}
