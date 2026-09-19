"use client";

import { useEffect } from "react";
import { collection, getDoc, onSnapshot, query, where } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";
import { WebRTCCall, type CallDoc } from "@/lib/webrtc";
import { useAuth } from "@/hooks/useAuth";
import { useActiveCall } from "@/hooks/useActiveCall";
import CallUI from "./CallUI";

/**
 * PART 5 — Voice calls. Mounted once, app-wide (see app/layout.tsx), so a call can actually be
 * received no matter which page the callee is currently on — a DM-thread-local listener would
 * miss every call placed while the recipient isn't sitting in that exact conversation. Renders
 * nothing itself besides CallUI, which reads the same global useActiveCall store this populates.
 */
export default function IncomingCallListener() {
  const { user } = useAuth();
  const { callId, start } = useActiveCall();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "calls"), where("calleeUid", "==", user.uid), where("status", "==", "ringing"));
    const unsub = onSnapshot(q, (snap) => {
      // A call that leaves the "ringing" set has either been answered (by us) or given up on. If the
      // CALLER hung up (or it was declined elsewhere) while our incoming screen is still up, that screen
      // has to go away — before this, it stayed on screen forever and could still be "answered".
      snap.docChanges().forEach((change) => {
        if (change.type !== "removed") return;
        const current = useActiveCall.getState();
        if (current.callId !== change.doc.id || current.direction !== "incoming" || current.status !== "ringing") return;
        getDoc(change.doc.ref)
          .then((latest) => {
            const status = latest.data()?.status;
            const stillOurs = useActiveCall.getState().callId === change.doc.id && useActiveCall.getState().status === "ringing";
            // "active" means WE just answered it — leave that alone.
            if (stillOurs && (!latest.exists() || status === "ended" || status === "declined")) {
              toast(`Missed call from ${current.peer?.displayName ?? "someone"}`);
              current.call?.dispose();
              useActiveCall.getState().reset();
            }
          })
          .catch(() => {});
      });
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as CallDoc;
        // Already tracking this exact call (e.g. this listener re-fired after a reconnect) —
        // never stomp an in-progress call's state with a fresh WebRTCCall instance.
        if (useActiveCall.getState().callId === docSnap.id) continue;
        getUserProfile(data.callerUid).then((callerProfile) => {
          const call = new WebRTCCall(docSnap.id);
          start(
            docSnap.id,
            call,
            {
              uid: data.callerUid,
              displayName: callerProfile?.displayName ?? "Someone",
              photoURL: callerProfile?.photoURL,
            },
            "incoming",
            "ringing"
          );
        });
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!callId) return null;
  return <CallUI />;
}
