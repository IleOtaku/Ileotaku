"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isBlockedEitherWay } from "@/lib/blocking";

export interface BlockedContentGateProps {
  /** The uid whose profile/content this page is rendering. */
  targetUid: string;
  children: ReactNode;
}

/**
 * Wraps a public profile page's content and hides it behind "This content isn't available"
 * when either party has blocked the other. The page itself is a server component with no
 * client auth context, so this check has to happen client-side after mount — the server
 * still renders the real profile markup, which briefly exists in the initial HTML before
 * hydration decides whether to show or hide it. That's an accepted trade-off (same class as
 * the blocked-subcollection read-visibility trade-off documented in firestore.rules): a
 * blocked visitor could still see the raw server HTML by disabling JS, but every real page
 * view goes through this gate.
 */
export default function BlockedContentGate({ targetUid, children }: BlockedContentGateProps) {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUid) {
      setChecked(true);
      return;
    }
    isBlockedEitherWay(user.uid, targetUid).then((blocked) => {
      setHidden(blocked);
      setChecked(true);
    });
  }, [user, targetUid]);

  if (!checked) return null;

  if (hidden) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center sm:px-6">
        <ShieldOff className="h-8 w-8 text-muted" />
        <p className="font-cinzel text-lg text-text">This content isn&apos;t available</p>
      </div>
    );
  }

  return <>{children}</>;
}
