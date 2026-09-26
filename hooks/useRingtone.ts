import { useEffect } from "react";
import { playRingtone, type RingtoneKind } from "@/lib/notificationSounds";

/** Plays the call ringtone while `kind` is set (see lib/notificationSounds.ts), and stops the
 * moment it becomes null or the component unmounts. */
export function useRingtone(kind: RingtoneKind | null): void {
  useEffect(() => {
    if (!kind) return;
    return playRingtone(kind);
  }, [kind]);
}
