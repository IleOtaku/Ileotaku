"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, Eye, FileText, Lock, Mic } from "lucide-react";
import { recordMessageView, isMessageViewable } from "@/lib/dms";
import type { DMMessage } from "@/types";
import DMMediaContent, { type DMMediaContentProps } from "./DMMediaContent";

function lockedLabel(settings: NonNullable<DMMessage["viewSettings"]>): string {
  switch (settings.mode) {
    case "view_once":
      return "View once";
    case "timed":
      if (settings.firstOpenedAt) return "Opened — tap to view";
      return `Opens for ${settings.deleteAfterMinutes && settings.deleteAfterMinutes % 60 === 0 ? `${settings.deleteAfterMinutes / 60}h` : `${settings.deleteAfterMinutes}min`}`;
    case "multi_view": {
      const left = Math.max(0, (settings.maxViews ?? 1) - (settings.viewCount ?? 0));
      return `${left} view${left === 1 ? "" : "s"} left`;
    }
    case "daily":
      return "Viewable once a day";
    default:
      return "View-controlled";
  }
}

function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const totalSeconds = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return (
    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-noto text-[10px] font-semibold text-ivory">
      Disappears in {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

/**
 * Beta feedback: "WHERE'S THE VIEW ONCE INTEGRATION? FOR IMAGES, VIDEOS, TEXTS THAT WAS
 * REQUESTED!?" Wraps DMMediaContent for any message carrying `viewSettings`: shows a blurred,
 * locked card (never the real content) until tapped, at which point it calls recordMessageView
 * and reveals it — staying revealed for as long as this component instance stays mounted, i.e.
 * for as long as this chat stays open, however long that is. The message itself isn't actually
 * marked expired until the viewer leaves (see recordMessageView/markViewOnceExpired in lib/dms.ts),
 * so re-checking isMessageViewable on every fresh mount (a genuinely already-spent message, from a
 * PRIOR visit) still correctly shows "This message has expired" instead. The sender always sees
 * their own content unlocked; the gate is for recipients only.
 */
export default function ViewControlledMedia({
  message: m,
  isOwn,
  accentColor,
  conversationId,
  viewerUid,
  onForward,
  onRevealed,
}: DMMediaContentProps & { conversationId: string; viewerUid: string; onRevealed?: (messageId: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const settings = m.viewSettings;

  if (!settings || isOwn) return <DMMediaContent message={m} isOwn={isOwn} accentColor={accentColor} onForward={onForward} />;

  const viewable = revealed || isMessageViewable(m, viewerUid);
  if (!viewable) {
    return <p className="mb-1 font-noto text-sm italic text-muted">This message has expired</p>;
  }

  if (!revealed) {
    const Icon = m.mediaType === "voice" ? Mic : m.mediaType === "file" ? FileText : settings.mode === "timed" ? Clock : settings.mode === "daily" ? Calendar : Eye;
    return (
      <button
        type="button"
        onClick={() => {
          setRevealed(true);
          recordMessageView(conversationId, m.id, viewerUid, m).catch(() => {});
          // Beta feedback bug fix: "view-once deletes too fast." Actual expiry is deferred until
          // the viewer leaves this chat — see MessagesClient's pendingViewOnceRef, which is what
          // this notifies, and lib/dms.ts's markViewOnceExpired for what runs at that point.
          onRevealed?.(m.id);
        }}
        className="relative mb-1 flex h-40 w-56 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-black/40 text-ivory"
      >
        {(m.mediaUrl || m.mediaUrls?.[0]) && (m.mediaType === "image" || m.mediaType === "video") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" src={m.mediaUrls?.[0] ?? m.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-xl" />
        )}
        <Lock className="relative h-6 w-6" />
        <span className="relative flex items-center gap-1.5 font-noto text-xs font-semibold">
          <Icon className="h-3.5 w-3.5" /> {lockedLabel(settings)}
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <DMMediaContent message={m} isOwn={isOwn} accentColor={accentColor} onForward={onForward} />
      {settings.mode === "timed" && settings.expiresAt && <CountdownBadge expiresAt={settings.expiresAt} />}
    </div>
  );
}
