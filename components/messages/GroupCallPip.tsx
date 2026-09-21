"use client";

import { useEffect, useState } from "react";
import { Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatCallDuration } from "@/lib/groupCalls";
import type { PeerState } from "@/lib/groupWebRTC";
import type { GroupCall } from "@/types";

interface GroupCallPipProps {
  call: GroupCall | null;
  localUid: string;
  speaking: Record<string, boolean>;
  peerStates: Record<string, PeerState>;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  onExpand: () => void;
}

/**
 * The minimized group call: a small floating bar that stays on top of every page while the call keeps running, so
 * you can browse, scroll the feed or read a chapter without leaving the call. Beta feedback: "Add a minimize button
 * to group call UI, so people can be on the call but scroll…". Everything that makes the call work (microphone, peer
 * connections, signaling, the heartbeat) lives in the useGroupCall store, not in the full-screen UI, so hiding the
 * screen doesn't touch any of it — this is only a different view of the same call.
 *
 * Shows: a live/connecting dot, how long the call has run, who's on it (a ring lights up around whoever is talking),
 * and the two controls you actually need mid-call — mute and hang up. Tap anywhere else to expand it again.
 */
export default function GroupCallPip({ call, localUid, speaking, peerStates, muted, onToggleMute, onEnd, onExpand }: GroupCallPipProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const joined = call ? Object.values(call.participants).filter((p) => p.status === "joined") : [];
  const active = call?.status === "active" && !!call.activeAt;
  const seconds = active ? Math.max(0, Math.floor((now - Date.parse(call!.activeAt as string)) / 1000)) : 0;
  const anyoneConnected = Object.values(peerStates).some((s) => s === "connected");
  const status = !call ? "Connecting…" : active ? formatCallDuration(seconds) : "Ringing…";
  // Put whoever is talking first so they're never hidden behind the "+N".
  const shown = [...joined].sort((a, b) => Number(!!speaking[b.uid]) - Number(!!speaking[a.uid])).slice(0, 4);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      aria-label="Group call in progress — tap to expand"
      data-testid="group-call-pip"
      className="glass fixed right-3 z-[200] flex max-w-[calc(100vw-1.5rem)] cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 shadow-2xl sm:right-6"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", anyoneConnected ? "bg-green-500" : "animate-pulse bg-amber-400")} />

      <div className="min-w-0">
        <p className="truncate font-cinzel text-sm text-text" data-testid="pip-title">
          {call?.conversationName || "Group call"}
        </p>
        <p className="font-noto text-[11px] text-muted" data-testid="pip-status">
          <span data-testid="pip-duration">{status}</span>
          {call && <span> · {joined.length} on the call</span>}
        </p>
      </div>

      <div className="flex shrink-0 -space-x-2">
        {shown.map((p) => (
          <span
            key={p.uid}
            data-testid="pip-avatar"
            data-uid={p.uid}
            data-speaking={speaking[p.uid] && !(p.uid === localUid ? muted : p.isMuted) ? "true" : "false"}
            className={cn(
              "rounded-full ring-2 transition-shadow",
              speaking[p.uid] && !(p.uid === localUid ? muted : p.isMuted) ? "ring-green-500" : "ring-bg"
            )}
          >
            <Avatar uid={p.uid} photoURL={p.photoURL} displayName={p.displayName} size={28} />
          </span>
        ))}
        {joined.length > shown.length && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg4 font-noto text-[10px] font-semibold text-text ring-2 ring-bg">
            +{joined.length - shown.length}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          data-testid="pip-mute"
          className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", muted ? "bg-text text-bg" : "bg-bg4 text-text hover:bg-bg3")}
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          aria-label="Expand call"
          data-testid="pip-expand"
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-bg4 text-text hover:bg-bg3 sm:flex"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEnd();
          }}
          aria-label="Leave call"
          data-testid="pip-end"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-ivory hover:bg-red-500"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
