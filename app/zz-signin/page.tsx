"use client";

import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { keepMessage, unkeepMessage } from "@/lib/dms";

declare global {
  interface Window {
    __rule?: (name: string, conv: string, msg: string, arg: string) => Promise<string>;
  }
}

export default function Page() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState("signing in...");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return setStatus("no token");
    signInWithCustomToken(auth, token)
      .then(() => setStatus("signed in"))
      .catch((e) => setStatus("failed: " + e.message));
    // Probes the REAL security rules from a signed-in client (the browser SDK, not the admin SDK).
    window.__rule = async (name, conv, msg, arg) => {
      const ref = doc(db, "conversations", conv, "messages", msg);
      try {
        if (name === "keepOther") await updateDoc(ref, { isKept: true, keptBy: [arg] });
        else if (name === "keepJunk") await updateDoc(ref, { isKept: true, keptBy: ["x"], text: "hacked" });
        else if (name === "isKeptString") await updateDoc(ref, { isKept: "yes", keptBy: [auth.currentUser!.uid] });
        else if (name === "keepSelf") await keepMessage(conv, msg, auth.currentUser!.uid);
        else if (name === "unkeepSelf") await unkeepMessage(conv, msg, auth.currentUser!.uid);
        return "ALLOWED";
      } catch (e) {
        return ((e as { code?: string }).code ?? "") + " | " + String((e as Error).message).slice(0, 160);
      }
    };
  }, []);

  return (
    <p id="status" style={{ color: "#ddd", padding: 20 }}>
      {status} · uid={user?.uid ?? "-"} · profile={profile?.displayName ?? "-"}
    </p>
  );
}
