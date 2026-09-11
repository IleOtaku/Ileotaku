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
 * Beta feedback bug: this used to render nothing at all (`return null`) for the entire time the
 * block check was in flight — on a slow or flaky connection (confirmed live via error-log
 * entries: `blocking.isBlocked` failing with "client is offline" repeatedly), that meant a
 * completely blank page, matching a bug report of "can't view people's profiles... except
 * message" almost exactly (the profile page IS this gate's children — a page that never finishes
 * checking never shows anything). isBlocked()/isBlockedBy() below already catch their own errors
 * and resolve `false` rather than rejecting, so this never hung forever, but it could stay blank
 * for as long as the check took. Now content renders immediately and optimistically; the notice
 * only swaps in once a block is actually confirmed, so the overwhelmingly common (unblocked) case
 * never shows a blank page at all, and a real block still hides the content the moment it's known.
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

  useEffect(() => {
    if (!user || user.uid === targetUid) return;
    let cancelled = false;
    Promise.all([isBlocked(user.uid, targetUid), isBlocked(targetUid, user.uid)]).then(
      ([byMe, byThem]) => {
        if (cancelled) return;
        setBlockedByMe(byMe);
        setBlockedByThem(byThem);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [user, targetUid]);

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
