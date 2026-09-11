"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isBlocked } from "@/lib/blocking";
import BlockButton from "./BlockButton";

export interface BlockedContentGateProps {
  /** The uid whose profile/content this page is rendering. */
  targetUid: string;
  /** Handle or display name, shown in the unblock button's label — falls back to the bare uid
   * when the caller doesn't have a nicer label handy. */
  targetLabel?: string;
  children: ReactNode;
}

/**
 * Wraps a public profile page's content and hides it behind a block-aware notice whenever
 * either party has blocked the other. The page itself is a server component with no client auth
 * context, so this check has to happen client-side after mount — the server still renders the
 * real profile markup, which briefly exists in the initial HTML before hydration decides
 * whether to show or hide it. That's an accepted trade-off (same class as the blocked-
 * subcollection read-visibility trade-off documented in firestore.rules): a blocked visitor
 * could still see the raw server HTML by disabling JS, but every real page view goes through
 * this gate.
 *
 * The two directions read differently: if the VIEWER blocked this profile, they're shown an
 * actionable "You've blocked this user" banner with an Unblock button — clicking it re-checks
 * and reveals the profile immediately, no page reload needed. If the PROFILE blocked the
 * viewer instead, there's nothing the viewer can do about it, so it's just a plain notice.
 */
export default function BlockedContentGate({ targetUid, targetLabel, children }: BlockedContentGateProps) {
  const { user } = useAuth();
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUid) {
      setChecked(true);
      return;
    }
    Promise.all([isBlocked(user.uid, targetUid), isBlocked(targetUid, user.uid)]).then(
      ([byMe, byThem]) => {
        setBlockedByMe(byMe);
        setBlockedByThem(byThem);
        setChecked(true);
      }
    );
  }, [user, targetUid]);

  if (!checked) return null;

  if (blockedByThem) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center sm:px-6">
        <ShieldOff className="h-8 w-8 text-muted" />
        <p className="font-cinzel text-lg text-text">This content isn&apos;t available</p>
      </div>
    );
  }

  if (blockedByMe && user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        <ShieldOff className="h-8 w-8 text-clay2" />
        <p className="font-cinzel text-lg text-text">You&apos;ve blocked this user</p>
        <p className="max-w-sm font-noto text-sm text-muted">
          Their profile and content are hidden from you until you unblock them.
        </p>
        <BlockButton
          targetUid={targetUid}
          targetLabel={targetLabel ?? targetUid}
          onUnblocked={() => setBlockedByMe(false)}
        />
      </div>
    );
  }

  return <>{children}</>;
}
