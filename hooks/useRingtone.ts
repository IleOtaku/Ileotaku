import { useEffect } from "react";
import { playRingtone } from "@/lib/notificationSounds";

/** Plays the call ringtone (ringtone.mp3) while `active` is true, and stops the moment it becomes
 * false or the component unmounts. */
export function useRingtone(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return playRingtone();
  }, [active]);
}
