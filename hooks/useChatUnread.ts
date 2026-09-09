"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToLatestChatMessage } from "@/lib/firestore";
import { useAuth } from "./useAuth";

const STORAGE_PREFIX = "ileotaku:chat-last-read:";

/** Per-manga "I've seen the chat up to here" marker, kept in localStorage rather than
 * Firestore — it's a lightweight, per-device UI affordance, not data worth a write/rules
 * round-trip. Wrapped in try/catch since localStorage can throw (private browsing, quota). */
export function getChatLastRead(mangaId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_PREFIX + mangaId) ?? "";
  } catch {
    return "";
  }
}

export function markChatRead(mangaId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + mangaId, new Date().toISOString());
  } catch {
    // Non-fatal — worst case the unread dot doesn't clear until the next new message.
  }
}

/**
 * True when the current manga's chat room has a message newer than the last time this
 * device marked it read. `readSignal` is a caller-bumped counter (rather than a dependency
 * this hook could derive on its own) — pass a value that increments each time markChatRead()
 * is called, so the comparison re-runs immediately instead of only on the next new message.
 */
export function useChatUnread(mangaId: string | null, readSignal: number): boolean {
  const { user } = useAuth();
  const [latest, setLatest] = useState<{ createdAt: string } | null>(null);

  useEffect(() => {
    if (!mangaId || !user) {
      setLatest(null);
      return;
    }
    return subscribeToLatestChatMessage(mangaId, setLatest, () => setLatest(null));
  }, [mangaId, user]);

  return useMemo(() => {
    if (!mangaId || !latest) return false;
    const lastRead = getChatLastRead(mangaId);
    return !lastRead || latest.createdAt > lastRead;
    // readSignal isn't read directly, but bumping it must force this memo to re-run so a
    // just-called markChatRead() is reflected immediately rather than on the next message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, latest, readSignal]);
}
