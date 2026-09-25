import { Check, CheckCheck } from "lucide-react";
import type { DMMessage } from "@/types";

export interface MessageTicksProps {
  message: Pick<DMMessage, "senderId" | "seenBy">;
  /** Read receipts are the SENDER's paid feature — a non-Platinum sender only ever gets the
   * plain single tick, regardless of what seenBy actually says. */
  isSenderPlatinum: boolean;
  /** 1:1 only — whether the other participant is online right now ("delivered" = they currently
   * have the app open, not a persisted delivery event; see lib/dms.ts's own doc comment on why). */
  isOtherOnline?: boolean;
  isGroup: boolean;
  className?: string;
}

/**
 * Beta feedback: "Where's the platinum members read receipts feature?" ✓ sent, ✓✓ grey delivered
 * (1:1 only — the other person currently has the app open), ✓✓ blue seen (Platinum senders only).
 */
export default function MessageTicks({ message, isSenderPlatinum, isOtherOnline, isGroup, className }: MessageTicksProps) {
  const seenByOthers = message.seenBy?.filter((s) => s.uid !== message.senderId) ?? [];
  const seen = isSenderPlatinum && seenByOthers.length > 0;
  const delivered = !isGroup && !!isOtherOnline;

  if (seen) {
    return <CheckCheck data-testid="tick-seen" className={`h-3.5 w-3.5 text-sky-400 ${className ?? ""}`} />;
  }
  if (delivered) {
    return <CheckCheck data-testid="tick-delivered" className={`h-3.5 w-3.5 opacity-70 ${className ?? ""}`} />;
  }
  return <Check data-testid="tick-sent" className={`h-3.5 w-3.5 opacity-70 ${className ?? ""}`} />;
}
