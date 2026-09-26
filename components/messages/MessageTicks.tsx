import type { DMMessage } from "@/types";

export interface MessageTicksProps {
  message: Pick<DMMessage, "senderId" | "seenBy">;
  /** Read receipts are the SENDER's paid feature — a non-Platinum sender only ever gets the
   * grey ticks, regardless of what seenBy actually says (seenBy is only ever written at all for a
   * Platinum sender's message in the first place — see lib/dms.ts's shouldRecordSeen). */
  isSenderPlatinum: boolean;
  /** 1:1 only — whether the other participant is online right now ("delivered" = they currently
   * have the app open, not a persisted delivery event; see lib/dms.ts's own doc comment on why). */
  isOtherOnline?: boolean;
  isGroup: boolean;
  /** Group chats only — every participant uid in the conversation (including the sender), used for
   * the all-or-nothing check below. Unused for 1:1 (that side reads seenBy directly). */
  participants?: string[];
  /** The sender's own bubble color (hex), so the seen tick can flip to white on a bubble close
   * enough to the seen-tick's own light purple that it would otherwise wash out. */
  bubbleColor?: string;
  className?: string;
}

/** Beta feedback: "Update tick colors... seen ticks are now light purple instead of blue." */
const SEEN_COLOR = "#c4b5fd";
const SEEN_COLOR_ON_LIGHT_BUBBLE = "#ffffff";
const DEFAULT_COLOR = "#6b7280";

function isLightPurpleBubble(bubbleColor?: string): boolean {
  if (!bubbleColor?.startsWith("#")) return false;
  const hex = bubbleColor.slice(1);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (full.length !== 6) return false;
  const value = parseInt(full, 16);
  return Number.isFinite(value) && value > 0x9090ff;
}

/**
 * Beta feedback: "Where's the platinum members read receipts feature?" ✓ sent (grey), ✓✓ delivered
 * (grey), ✓✓ seen (light purple, or white on a bubble color close enough to wash it out) — seen
 * ticks are Platinum-sender-only.
 *
 * Beta feedback bug: "group chat ticks logic" — a group used to go double-tick the moment ANY one
 * member had seen/received it, which reads as "everyone's seen this" the instant the fastest
 * reader opens it. Now all-or-nothing: single tick until it's accounted for by every OTHER member,
 * double grey once it is, double purple only once every other member has actually opened it.
 */
export default function MessageTicks({ message, isSenderPlatinum, isOtherOnline, isGroup, participants, bubbleColor, className }: MessageTicksProps) {
  const seenUids = new Set((message.seenBy ?? []).map((s) => s.uid));

  let seen: boolean;
  let delivered: boolean;
  if (isGroup) {
    const others = (participants ?? []).filter((uid) => uid !== message.senderId);
    const seenByAll = others.length > 0 && others.every((uid) => seenUids.has(uid));
    seen = isSenderPlatinum && seenByAll;
    // Groups have no real per-recipient delivery signal (unlike 1:1's presence-based
    // `isOtherOnline`) — a persisted group message counts as delivered to everyone the moment it
    // exists, same approximation the beta feedback spec itself calls for.
    delivered = others.length > 0;
  } else {
    seen = isSenderPlatinum && seenUids.size > 0;
    delivered = !!isOtherOnline;
  }

  const seenColor = isLightPurpleBubble(bubbleColor) ? SEEN_COLOR_ON_LIGHT_BUBBLE : SEEN_COLOR;

  if (seen) {
    return (
      <svg width="16" height="11" viewBox="0 0 20 11" fill="none" className={className} data-testid="tick-seen">
        <path d="M1 6L5 10L15 1" stroke={seenColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 6L10 10L20 1" stroke={seenColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (delivered) {
    return (
      <svg width="16" height="11" viewBox="0 0 20 11" fill="none" className={className} data-testid="tick-delivered">
        <path d="M1 6L5 10L15 1" stroke={DEFAULT_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 6L10 10L20 1" stroke={DEFAULT_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="11" viewBox="0 0 16 11" fill="none" className={className} data-testid="tick-sent">
      <path d="M1 6L5 10L15 1" stroke={DEFAULT_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
