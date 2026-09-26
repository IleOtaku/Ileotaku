"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveCall } from "@/hooks/useActiveCall";
import { useGroupCall } from "@/hooks/useGroupCall";
import { shouldRingFor, subscribeToLiveGroupCalls, type CallUser } from "@/lib/groupCalls";
import type { GroupCall } from "@/types";
import { useRingtone } from "@/hooks/useRingtone";
import GroupCallPip from "./GroupCallPip";
import GroupCallScreen from "./GroupCallScreen";
import IncomingGroupCall from "./IncomingGroupCall";

/**
 * Group voice calls — mounted ONCE, app-wide (app/layout.tsx), for the same reason
 * IncomingCallListener is: a call has to ring whichever page the invitee is on, and the call
 * itself (mic, peer connections) has to survive navigating between pages. It listens for live
 * calls the user is invited to, shows the incoming-call overlay, and renders the full-screen call
 * UI for whatever call the useGroupCall store is currently running.
 */
export default function GroupCallHost() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const phase = useGroupCall((s) => s.phase);
  const call = useGroupCall((s) => s.call);
  const peerStates = useGroupCall((s) => s.peerStates);
  const speaking = useGroupCall((s) => s.speaking);
  const muted = useGroupCall((s) => s.muted);
  const speakerOn = useGroupCall((s) => s.speakerOn);
  const dismissed = useGroupCall((s) => s.dismissedRings);
  const minimized = useGroupCall((s) => s.minimized);
  const inDirectCall = useActiveCall((s) => !!s.callId);

  const [liveCalls, setLiveCalls] = useState<GroupCall[]>([]);
  // The ring window and the heartbeat staleness check are both functions of "now"; re-evaluate
  // every few seconds so a call that stopped being ring-worthy while nothing else changed goes away.
  const [now, setNow] = useState(() => Date.now());

  const me: CallUser | null = useMemo(
    () =>
      user
        ? {
            uid: user.uid,
            displayName: profile?.displayName || user.displayName || "Member",
            photoURL: profile?.photoURL || user.photoURL || undefined,
          }
        : null,
    [user, profile?.displayName, profile?.photoURL]
  );

  useEffect(() => {
    if (!user) {
      setLiveCalls([]);
      return;
    }
    return subscribeToLiveGroupCalls(user.uid, null, setLiveCalls);
  }, [user]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  // Signing out (or switching accounts) mid-call must not leave the old account's call running.
  useEffect(() => {
    if (!user && useGroupCall.getState().phase !== "idle") useGroupCall.getState().leave().catch(() => {});
  }, [user]);

  // The caller hears the ringback until somebody picks up — whether the call is full-screen or minimized.
  useRingtone(!!(call && call.status === "ringing" && user && call.participants[user.uid]?.status === "joined"));

  const ringing =
    user && phase === "idle" && !inDirectCall
      ? liveCalls.find((c) => !dismissed.includes(c.callId) && shouldRingFor(c, user.uid, now))
      : undefined;

  async function accept(c: GroupCall) {
    if (!me) return;
    try {
      await useGroupCall.getState().join(c.callId, me);
      router.push(`/messages?open=${c.conversationId}`);
    } catch (error) {
      useGroupCall.getState().dismissRing(c.callId);
      toast.error(error instanceof Error ? error.message : "Couldn't join the call.");
    }
  }

  return (
    <>
      {ringing && me && (
        <IncomingGroupCall
          key={ringing.callId}
          call={ringing}
          onAccept={() => accept(ringing)}
          onDecline={() => useGroupCall.getState().decline(ringing, me)}
          onTimeout={() => useGroupCall.getState().dismissRing(ringing.callId)}
        />
      )}
      {phase !== "idle" && user && minimized && (
        <GroupCallPip
          call={call}
          localUid={user.uid}
          speaking={speaking}
          peerStates={peerStates}
          muted={muted}
          onToggleMute={() => useGroupCall.getState().toggleMute()}
          onEnd={() => useGroupCall.getState().leave()}
          onExpand={() => useGroupCall.getState().setMinimized(false)}
        />
      )}
      {phase !== "idle" && user && !minimized && (
        <GroupCallScreen
          call={call}
          localUid={user.uid}
          peerStates={peerStates}
          speaking={speaking}
          muted={muted}
          speakerOn={speakerOn}
          onToggleMute={() => useGroupCall.getState().toggleMute()}
          onToggleSpeaker={() => useGroupCall.getState().toggleSpeaker()}
          onEnd={() => useGroupCall.getState().leave()}
          onMinimize={() => useGroupCall.getState().setMinimized(true)}
        />
      )}
    </>
  );
}
