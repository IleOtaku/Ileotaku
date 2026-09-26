"use client";

import { useEffect, useRef } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useDMStore } from "@/hooks/useDMStore";
import { playNotificationSound } from "@/lib/notificationSounds";
import type { Conversation } from "@/types";

const CONVERSATIONS = "conversations";

/**
 * Beta feedback bug: "notification.mp3 not playing when a DM arrives while the user is outside
 * the active thread." MessagesClient's own subscription only ever exists for the ONE conversation
 * currently open, so a message arriving in a different conversation — or the user leaving
 * /messages entirely — was never watched by anything, and the OS push notification plays its own
 * native sound, not this app's. Mounted once, globally, in app/layout.tsx, so it's alive on every
 * page (reading manga, the feed, a profile — not just /messages), same as WhatsApp Web.
 *
 * Deliberately a SINGLE listener on the conversations query, not one Firestore listener per
 * conversation: sendDM (lib/dms.ts) already denormalizes `lastMessage`/`lastMessageAt`/
 * `lastSenderId` onto the conversation document itself for exactly this kind of "what was the
 * newest message" check, so nothing here needs a second read into any conversation's messages
 * subcollection. Cheaper for an account with many conversations, and avoids the leak a
 * per-conversation listener design falls into if its cleanup isn't wired to survive every
 * conversations-list update.
 */
export default function GlobalDMListener() {
  const { user } = useAuth();
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const activeConversationIdRef = useRef(activeConversationId);
  const lastSeenRef = useRef<Map<string, string>>(new Map());
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!user) return;
    lastSeenRef.current = new Map();
    hasLoadedOnceRef.current = false;

    const q = query(collection(db, CONVERSATIONS), where("participants", "array-contains", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      snap.docs.forEach((d) => {
        const convo = d.data() as Conversation;
        const conversationId = d.id;
        const lastMessageAt = convo.lastMessageAt;
        if (!lastMessageAt) return;

        const previouslySeen = lastSeenRef.current.get(conversationId);
        lastSeenRef.current.set(conversationId, lastMessageAt);

        // Seeding pass (initial snapshot, or right after a fresh sign-in) — never plays a sound
        // for a conversation's EXISTING last message, only for one that changes after this.
        if (!hasLoadedOnceRef.current) return;
        if (previouslySeen === lastMessageAt) return;
        // Own message (sent from elsewhere, e.g. another device) and system messages ("X joined
        // the group") never get a sound.
        if (convo.lastSenderId === user.uid || convo.lastSenderId === "system") return;
        // MessagesClient's own subscription already plays message.mp3 for whichever conversation
        // is actually open right now — this listener is only for every OTHER conversation.
        if (conversationId === activeConversationIdRef.current) return;

        playNotificationSound();
      });
      hasLoadedOnceRef.current = true;
    });

    return unsub;
  }, [user]);

  return null;
}
