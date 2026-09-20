"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useRingtone } from "@/hooks/useRingtone";
import type { GroupCall } from "@/types";

/** How long the phone rings on screen before it stops on its own. */
const RING_SECONDS = 30;

interface IncomingGroupCallProps {
  call: GroupCall;
  /** Awaits the mic prompt + join; the buttons are disabled while it runs. */
  onAccept: () => Promise<void> | void;
  onDecline: () => void;
  /** Rang for {@link RING_SECONDS} without an answer. NOT a decline: the caller shouldn't see
   * "[Name] declined the call" for someone who simply didn't pick up — they stay "invited" and
   * are counted as having missed it when the call ends. */
  onTimeout: () => void;
}

/** Full-screen "Group voice call" ring: pulsing rings, who's calling, who else is on it. */
export default function IncomingGroupCall({ call, onAccept, onDecline, onTimeout }: IncomingGroupCallProps) {
  const [busy, setBusy] = useState(false);
  useRingtone(busy ? null : "incoming");
  const caller = call.participants[call.initiatorUid];
  const others = Object.values(call.participants).filter((p) => p.uid !== call.initiatorUid);

  useEffect(() => {
    const t = setTimeout(onTimeout, RING_SECONDS * 1000);
    return () => clearTimeout(t);
    // The 30s clock is per call, not per parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.callId]);

  async function accept() {
    setBusy(true);
    try {
      await onAccept();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="incoming-group-call"
      role="alertdialog"
      aria-label={`Incoming group call from ${caller?.displayName ?? "someone"}`}
      className="fixed inset-0 z-[210] flex flex-col items-center justify-center gap-5 bg-bg/98 px-6"
    >
      <p className="font-noto text-sm uppercase tracking-wide text-muted">Group voice call</p>

      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-clay/25" />
        <span className="absolute inset-4 animate-ping rounded-full bg-clay/30 [animation-delay:300ms]" />
        <Avatar uid={caller?.uid} photoURL={caller?.photoURL} displayName={caller?.displayName} size={112} className="relative" />
      </div>

      <div className="text-center">
        <p className="font-cinzel text-2xl text-text" data-testid="incoming-group-caller">
          {caller?.displayName ?? "Someone"}
        </p>
        <p className="mt-1 font-noto text-sm text-muted">
          is calling{call.conversationName ? ` in ${call.conversationName}` : " the group"}
        </p>
      </div>

      {others.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex -space-x-2">
            {others.slice(0, 5).map((p) => (
              <Avatar
                key={p.uid}
                uid={p.uid}
                photoURL={p.photoURL}
                displayName={p.displayName}
                size={32}
                className="ring-2 ring-bg"
              />
            ))}
          </div>
          <p className="font-noto text-xs text-muted">
            {others.length === 1 ? "and 1 other invited" : `and ${others.length} others invited`}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-12">
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          aria-label="Decline"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-ivory shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          aria-label="Accept"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-ivory shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
        >
          <Phone className="h-6 w-6" />
        </button>
      </div>
      {busy && <p className="font-noto text-sm text-muted">Joining…</p>}
    </div>
  );
}
