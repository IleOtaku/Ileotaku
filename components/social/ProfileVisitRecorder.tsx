"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { recordVisit } from "@/lib/profileVisits";

interface ProfileVisitRecorderProps {
  profileUid: string;
}

/** Invisible client-side beacon mounted on a profile page — records that the signed-in viewer
 * visited `profileUid` on mount. Renders nothing; recordVisit() itself already no-ops for
 * self-visits and swallows its own errors, so this stays a pure fire-and-forget effect. */
export default function ProfileVisitRecorder({ profileUid }: ProfileVisitRecorderProps) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    recordVisit(user.uid, profileUid);
  }, [user, profileUid]);

  return null;
}
