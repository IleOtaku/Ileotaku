"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Maximize2, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useActiveCall } from "@/hooks/useActiveCall";
import { checkMicrophonePermission } from "@/lib/webrtc";

/** How long an unanswered outgoing call rings before it's ended as "missed". */
const RING_TIMEOUT_MS = 45_000;

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * PART 5 — Voice calls. Renders either a full-screen incoming-call overlay (ringing, not yet
 * answered), a full-screen active-call UI, or — once minimized — a small floating pip, all driven
 * by the single global useActiveCall store IncomingCallListener/the DM thread's call button
 * populate. Mounted by IncomingCallListener, which already gates rendering this on `callId`
 * being set, so this component itself never has to re-check that.
 */
export default function CallUI() {
  const { call, peer, direction, status, minimized, remoteStream, muted, setStatus, setRemoteStream, setMuted, minimize, restore, reset } =
    useActiveCall();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [requestingMic, setRequestingMic] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const connectedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!call) return;
    call.onRemoteStream((stream) => setRemoteStream(stream));
    call.onStatusChange((s) => setStatus(s));
    setMicReady(call.micReady);
    call.onMicReady(() => setMicReady(true));
    call.onCallEnded(() => {
      toast("Call ended.");
      reset();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call]);

  // An outgoing call nobody picks up rings out after 45 seconds instead of ringing forever. Ending it
  // through endCall() is also what logs "Missed voice call" into the conversation.
  useEffect(() => {
    if (!call || status !== "ringing" || direction !== "outgoing") return;
    const timer = setTimeout(() => {
      toast("No answer.");
      call.endCall().finally(() => reset());
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, status, direction]);

  // Attaches the remote stream to whichever <audio> element is currently mounted. Also used as
  // that element's callback ref (see `remoteAudio` below), because the minimized-pip branch returns
  // a different tree shape than the full-screen branches — toggling minimize/restore unmounts one
  // <audio> and mounts a fresh one with no srcObject, and an effect keyed only on `remoteStream`
  // never re-runs for that, which silently killed the audio after minimizing.
  function attachRemoteStream(el: HTMLAudioElement | null) {
    audioRef.current = el;
    if (!el || !remoteStream) return;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
    if (el.paused) el.play().catch((error) => console.warn("[webrtc] remote audio play() blocked:", error));
  }

  useEffect(() => {
    attachRemoteStream(audioRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStream]);

  useEffect(() => {
    if (status === "active" && connectedAtRef.current === null) connectedAtRef.current = Date.now();
    if (status !== "active") return;
    const interval = setInterval(() => {
      if (connectedAtRef.current) setSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!call || !peer) return null;

  // Beta feedback bug: "we can't hear each other on calls." Root cause — this <audio> element
  // used to live ONLY inside the "active call" JSX branch below, which doesn't render until
  // `status` (driven by a Firestore round-trip) flips to "active". But `pc.ontrack` — and with it
  // `remoteStream` — can fire the moment ICE/SDP negotiation completes, which races ahead of that
  // Firestore update on both sides (the callee sets `status: "active"` themselves in
  // answerCall(), then has to wait for their OWN onSnapshot to fire before this component
  // re-renders into the branch that mounts the <audio> tag at all). The effect that assigns
  // `audioRef.current.srcObject = remoteStream` only re-runs when `remoteStream` itself changes
  // (see its dependency array below) — so if the stream arrived while `audioRef.current` was
  // still null (element not yet mounted), that guard silently no-ops and the effect never gets a
  // second chance to attach it once the element finally mounts, leaving both sides with a fully
  // connected call and no audio in either direction. Rendering this unconditionally (for every
  // status once call+peer exist, not just "active") keeps the ref attached from the very start.
  const remoteAudio = <audio ref={attachRemoteStream} autoPlay playsInline muted={!speakerOn} className="hidden" />;

  async function handleAccept() {
    if (!call) return;
    // Beta feedback bug: "we can't hear each other on calls" — same up-front permission check as
    // the caller side (see MessagesClient.tsx's handleStartCall), plus a visible
    // "Requesting microphone..." status while getUserMedia's own native prompt (for a "prompt"
    // state, i.e. not yet asked) is actually on screen, so accepting doesn't look frozen.
    if ((await checkMicrophonePermission()) === "denied") {
      toast.error("Please enable microphone access in your browser settings to answer calls.");
      return;
    }
    setRequestingMic(true);
    try {
      await call.answerCall(useActiveCall.getState().callId ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't answer this call.");
      reset();
    } finally {
      setRequestingMic(false);
    }
  }

  async function handleDecline() {
    await call?.declineCall();
    reset();
  }

  async function handleEnd() {
    await call?.endCall();
    reset();
  }

  function handleToggleMute() {
    if (!call) return;
    setMuted(call.toggleMute());
  }

  // ---- Minimized pip ----
  if (minimized) {
    return (
      <>
        {remoteAudio}
        <button
          type="button"
          onClick={restore}
          className="glass fixed bottom-24 right-4 z-[200] flex items-center gap-2 rounded-full px-3 py-2 shadow-2xl sm:bottom-6"
        >
          <Avatar uid={peer.uid} photoURL={peer.photoURL} displayName={peer.displayName} size={28} />
          <span className="font-noto text-xs font-semibold text-text">{formatDuration(seconds)}</span>
          <Maximize2 className="h-3.5 w-3.5 text-muted" />
        </button>
      </>
    );
  }

  // ---- Incoming, not yet answered ----
  if (status === "ringing" && direction === "incoming") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-bg/98 backdrop-blur">
        {remoteAudio}
        <p className="font-noto text-sm uppercase tracking-wide text-muted">Voice Call</p>
        <div className="relative">
          <span className="absolute inset-0 -m-4 animate-ping rounded-full bg-clay/30" />
          <Avatar uid={peer.uid} photoURL={peer.photoURL} displayName={peer.displayName} size={112} />
        </div>
        <p className="font-cinzel text-2xl text-text">{peer.displayName}</p>
        {requestingMic && <p className="font-noto text-sm text-muted">Requesting microphone...</p>}
        <div className="mt-6 flex items-center gap-10">
          <button
            type="button"
            onClick={handleDecline}
            disabled={requestingMic}
            aria-label="Decline"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-ivory shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={requestingMic}
            aria-label="Accept"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-ivory shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
          >
            <Phone className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Outgoing, still ringing ----
  if (status === "ringing" && direction === "outgoing") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-bg/98 backdrop-blur">
        {remoteAudio}
        <Avatar uid={peer.uid} photoURL={peer.photoURL} displayName={peer.displayName} size={112} />
        <p className="font-cinzel text-2xl text-text">{peer.displayName}</p>
        <p className="font-noto text-sm text-muted">{micReady ? "Calling..." : "Requesting microphone..."}</p>
        <button
          type="button"
          onClick={handleEnd}
          aria-label="Cancel call"
          className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-ivory shadow-lg transition-transform hover:scale-105"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    );
  }

  // ---- Active call ----
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-bg/98 backdrop-blur">
      {remoteAudio}
      <Avatar uid={peer.uid} photoURL={peer.photoURL} displayName={peer.displayName} size={112} />
      <p className="font-cinzel text-2xl text-text">{peer.displayName}</p>
      <p className="font-noto text-sm text-muted">
        {status === "active" ? formatDuration(seconds) : status === "declined" ? "Declined" : "Reconnecting..."}
      </p>

      <button
        type="button"
        onClick={minimize}
        aria-label="Minimize call"
        className="absolute right-4 top-4 rounded-full p-2 text-muted hover:bg-bg3 hover:text-text"
      >
        <Maximize2 className="h-5 w-5 rotate-180" />
      </button>

      <div className="mt-8 flex items-center gap-6">
        <button
          type="button"
          onClick={handleToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? "bg-clay text-ivory" : "bg-bg3 text-text"}`}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setSpeakerOn((s) => !s)}
          aria-label={speakerOn ? "Turn speaker off" : "Turn speaker on"}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${!speakerOn ? "bg-clay text-ivory" : "bg-bg3 text-text"}`}
        >
          {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleEnd}
          aria-label="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-ivory shadow-lg transition-transform hover:scale-105"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
