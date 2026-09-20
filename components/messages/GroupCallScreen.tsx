"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useRingtone } from "@/hooks/useRingtone";
import { cn } from "@/lib/utils";
import { formatCallDuration } from "@/lib/groupCalls";
import type { PeerState } from "@/lib/groupWebRTC";
import type { CallParticipant, GroupCall } from "@/types";

interface GroupCallScreenProps {
  /** Null while the mic prompt / join is still in flight. */
  call: GroupCall | null;
  localUid: string;
  peerStates: Record<string, PeerState>;
  speaking: Record<string, boolean>;
  muted: boolean;
  speakerOn: boolean;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
}

/** What to print under a participant's name. */
function tileStatus(p: CallParticipant, isMe: boolean, peer: PeerState | undefined): string {
  if (isMe) return "Connected";
  switch (p.status) {
    case "invited":
      return "Ringing…";
    case "declined":
      return "Declined";
    case "left":
      return "Left";
    case "joined":
      if (peer === "connected") return "Connected";
      if (peer === "reconnecting") return "Reconnecting…";
      if (peer === "failed") return "Connection lost";
      return "Connecting…";
  }
}

const STATUS_ORDER: Record<CallParticipant["status"], number> = { joined: 0, invited: 1, declined: 2, left: 3 };

/** Full-screen group call: a grid of everyone invited (joined people lit up, ringing ones pulsing,
 * declined/left ones dimmed), the running duration, and mute / speaker / end controls. */
export default function GroupCallScreen({
  call,
  localUid,
  peerStates,
  speaking,
  muted,
  speakerOn,
  onToggleMute,
  onToggleSpeaker,
  onEnd,
}: GroupCallScreenProps) {
  const [now, setNow] = useState(() => Date.now());
  // The caller hears the ringback while nobody has picked up yet.
  useRingtone(call && call.status === "ringing" && call.participants[localUid]?.status === "joined" ? "outgoing" : null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const participants = call
    ? Object.values(call.participants).sort((a, b) => {
        if (a.uid === localUid) return -1;
        if (b.uid === localUid) return 1;
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      })
    : [];

  const connectedPeers = Object.values(peerStates).filter((s) => s === "connected").length;
  const isActive = call?.status === "active";
  const seconds = isActive && call?.activeAt ? Math.max(0, Math.floor((now - Date.parse(call.activeAt)) / 1000)) : 0;
  const headline = !call ? "Connecting…" : isActive ? formatCallDuration(seconds) : "Ringing…";
  const dotClass = connectedPeers > 0 ? "bg-green-500" : "animate-pulse bg-amber-400";
  const cols = participants.length <= 2 ? "grid-cols-2" : participants.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

  return (
    <div
      data-testid="group-call-screen"
      className="fixed inset-0 z-[200] flex flex-col bg-bg/98"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-cinzel text-lg text-text" data-testid="group-call-title">
            {call?.conversationName || "Group call"}
          </p>
          <p className="mt-0.5 flex items-center gap-2 font-noto text-xs text-muted">
            <span data-testid="group-call-dot" className={cn("h-2 w-2 rounded-full", dotClass)} />
            <span data-testid="group-call-duration">{headline}</span>
            {call && (
              <span>
                · {participants.filter((p) => p.status === "joined").length}/{call.maxParticipants} on the call
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className={cn("mx-auto grid max-w-3xl gap-3", cols)}>
          {participants.map((p) => (
            <ParticipantTile
              key={p.uid}
              participant={p}
              isMe={p.uid === localUid}
              isSpeaking={!!speaking[p.uid] && p.status === "joined" && !(p.uid === localUid ? muted : p.isMuted)}
              isMuted={p.uid === localUid ? muted : p.isMuted}
              status={tileStatus(p, p.uid === localUid, peerStates[p.uid])}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 px-4 pb-6 pt-2">
        <Tooltip content={muted ? "Unmute" : "Mute"}>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            data-testid="group-call-mute"
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
              muted ? "bg-text text-bg" : "bg-bg4 text-text hover:bg-bg3"
            )}
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        </Tooltip>
        <Tooltip content={speakerOn ? "Speaker on" : "Speaker off"}>
          <button
            type="button"
            onClick={onToggleSpeaker}
            aria-label={speakerOn ? "Turn speaker off" : "Turn speaker on"}
            aria-pressed={!speakerOn}
            data-testid="group-call-speaker"
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
              speakerOn ? "bg-bg4 text-text hover:bg-bg3" : "bg-text text-bg"
            )}
          >
            {speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </button>
        </Tooltip>
        <Tooltip content="Leave call">
          <button
            type="button"
            onClick={onEnd}
            aria-label="Leave call"
            data-testid="group-call-end"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-ivory shadow-lg transition-transform hover:scale-105"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function ParticipantTile({
  participant,
  isMe,
  isSpeaking,
  isMuted,
  status,
}: {
  participant: CallParticipant;
  isMe: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  status: string;
}) {
  const inactive = participant.status === "declined" || participant.status === "left";
  return (
    <div
      data-testid="participant-tile"
      data-uid={participant.uid}
      data-speaking={isSpeaking ? "true" : "false"}
      data-muted={isMuted ? "true" : "false"}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-2xl border-2 bg-bg2 px-3 py-5 transition-all duration-150",
        isSpeaking ? "border-green-500 shadow-[0_0_18px_rgba(34,197,94,0.35)]" : "border-transparent",
        inactive && "opacity-50"
      )}
    >
      {isMe && (
        <span className="absolute left-2 top-2 rounded-full bg-bg4 px-2 py-0.5 font-noto text-[10px] font-semibold uppercase tracking-wide text-muted">
          You
        </span>
      )}
      {isMuted && participant.status === "joined" && (
        <span
          data-testid="tile-muted-icon"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-ivory"
          aria-label="Muted"
        >
          <MicOff className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={cn("relative", participant.status === "invited" && "animate-pulse")}>
        <Avatar uid={participant.uid} photoURL={participant.photoURL} displayName={participant.displayName} size={72} />
      </div>
      <p className="max-w-full truncate font-noto text-sm font-semibold text-text">{participant.displayName}</p>
      <div className="flex h-4 items-center gap-2">
        <span data-testid="tile-status" className="font-noto text-xs text-muted">
          {status}
        </span>
        {isSpeaking && (
          <span data-testid="tile-speaking-bars" className="flex h-3 items-end gap-0.5" aria-label="Speaking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-0.5 animate-pulse rounded-full bg-green-500"
                style={{ height: `${[60, 100, 75][i]}%`, animationDelay: `${i * 120}ms`, animationDuration: "600ms" }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
