import { useEffect } from "react";
import { startRingtone, type RingtoneKind } from "@/lib/ringtone";

/** Plays the call ringtone while `kind` is set (our own ringtone — see lib/ringtone.ts), and stops the
 * moment it becomes null or the component unmounts. */
export function useRingtone(kind: RingtoneKind | null): void {
  useEffect(() => {
    if (!kind) return;
    return startRingtone(kind);
  }, [kind]);
}
