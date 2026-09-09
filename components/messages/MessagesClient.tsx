"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, ShieldOff, Send } from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers, isBlockedBy } from "@/lib/blocking";
import { getConversations, markDMRead, sendDM, startConversation, subscribeToConversation } from "@/lib/dms";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import SpotifyMiniPlayer from "@/components/spotify/SpotifyMiniPlayer";
import { formatTime, initials, stringToColor } from "@/lib/utils";
import type { Conversation, DMMessage } from "@/types";

/** Full DM page: conversation list + message thread. Protected — redirects to login if signed out. */
export default function MessagesClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handledWithParam = useRef(false);
  // uid -> currently-playing, for the sidebar's green dot. Deliberately a plain poll (not a
  // real-time listener) — a conversation list can show many contacts at once, and this only
  // needs to be roughly fresh, not instant.
  const [playingByUid, setPlayingByUid] = useState<Record<string, boolean>>({});
  // uids I've blocked — checked before starting a new conversation and to show the
  // "You've blocked this user" banner on an existing one.
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
  // Whether the other participant in the currently-open conversation has blocked ME —
  // checked per-conversation (not worth prefetching for every contact in the sidebar).
  const [blockingMe, setBlockingMe] = useState(false);

  useEffect(() => {
    if (!user) {
      setBlockedUids(new Set());
      return;
    }
    getBlockedUsers(user.uid).then((uids) => setBlockedUids(new Set(uids)));
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingConvos(true);
    getConversations(user.uid)
      .then((res) => {
        if (!cancelled) setConversations(res);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("getConversations failed:", error);
        if (!cancelled) setConversations([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingConvos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ?with=[uid] — from a creator page's Message button. Idempotent: startConversation resolves
  // to the same deterministic id whether or not it already exists.
  useEffect(() => {
    if (!user || handledWithParam.current) return;
    const withUid = searchParams.get("with");
    if (!withUid || withUid === user.uid) return;
    handledWithParam.current = true;

    (async () => {
      const [alreadyBlocked, blockedByThem] = await Promise.all([
        getBlockedUsers(user.uid).then((uids) => uids.includes(withUid)),
        isBlockedBy(user.uid, withUid),
      ]);
      if (alreadyBlocked || blockedByThem) {
        toast.error("You can't message this user.");
        return;
      }
      startConversation(user.uid, withUid)
        .then((id) => {
          setSelectedId(id);
          return getConversations(user.uid);
        })
        .then((fresh) => setConversations(fresh))
        .catch(() => toast.error("Couldn't start that conversation."));
    })();
  }, [user, searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToConversation(selectedId, setMessages, () => setMessages([]));
    if (user) markDMRead(selectedId, user.uid).catch(() => {});
    return unsub;
  }, [selectedId, user]);

  useEffect(() => {
    setBlockingMe(false);
    if (!user || !selectedId) return;
    const convo = conversations.find((c) => c.id === selectedId);
    const other = convo?.participants.find((id) => id !== user.uid);
    if (!other) return;
    isBlockedBy(user.uid, other).then(setBlockingMe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sidebar Spotify dots: poll every 60s rather than subscribing per-contact in real time —
  // this list can hold many conversations at once, and "roughly current" is enough for a dot.
  useEffect(() => {
    if (!user || conversations.length === 0) return;
    const otherUids = Array.from(
      new Set(conversations.map((c) => c.participants.find((id) => id !== user.uid)).filter((id): id is string => !!id))
    );

    let cancelled = false;
    async function poll() {
      const entries = await Promise.all(
        otherUids.map(async (uid) => [uid, (await getNowPlayingOnce(uid))?.isPlaying === true] as const)
      );
      if (!cancelled) setPlayingByUid(Object.fromEntries(entries));
    }
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, user]);

  async function handleSend() {
    if (!user || !selectedId || !text.trim()) return;
    const other = conversations.find((c) => c.id === selectedId)?.participants.find((id) => id !== user.uid);
    if ((other && blockedUids.has(other)) || blockingMe) {
      toast.error("You can't message this user.");
      return;
    }
    setSending(true);
    const value = text;
    setText("");
    try {
      await sendDM(selectedId, user.uid, value);
      setConversations(await getConversations(user.uid));
    } catch {
      toast.error("Couldn't send your message.");
      setText(value);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (authLoading || !user) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  const selected = conversations.find((c) => c.id === selectedId);
  const otherUid = selected?.participants.find((id) => id !== user.uid);
  const otherName = (otherUid && selected?.participantNames?.[otherUid]) || "Reader";
  const otherPhoto = otherUid ? selected?.participantPhotos?.[otherUid] : undefined;
  const blockedByMe = otherUid ? blockedUids.has(otherUid) : false;
  const conversationBlocked = blockedByMe || blockingMe;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-cinzel text-2xl text-text">Messages</h1>
      <div className="grid h-[600px] overflow-hidden rounded-2xl border border-bg4 sm:grid-cols-[300px_1fr]">
        <div className={`flex-col overflow-y-auto border-r border-bg4 bg-bg2 ${selectedId ? "hidden sm:flex" : "flex"}`}>
          {loadingConvos ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <span className="text-4xl">💬</span>
              <p className="font-cinzel text-sm text-text">No Messages Yet</p>
              <p className="font-noto text-xs text-muted">Find someone to message</p>
              <Link href="/search?tab=people" className="btn-primary mt-2 text-xs">
                Search
              </Link>
            </div>
          ) : (
            conversations.map((c) => {
              const other = c.participants.find((id) => id !== user.uid) ?? "";
              const name = c.participantNames?.[other] ?? "Reader";
              const photo = c.participantPhotos?.[other];
              const unread = c.unreadCounts?.[user.uid] ?? 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-bg4 px-4 py-3 text-left transition-colors hover:bg-bg3 ${
                    selectedId === c.id ? "bg-bg3" : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
            loading="lazy" src={photo} alt={name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
                        style={{ backgroundColor: stringToColor(name) }}
                      >
                        {initials(name)}
                      </span>
                    )}
                    {playingByUid[other] && (
                      <span
                        aria-label="Currently playing on Spotify"
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg2 bg-green-500"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-syne text-sm font-semibold text-text">{name}</span>
                      <span className="shrink-0 font-noto text-[10px] text-muted">
                        {formatTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-noto text-xs text-muted">
                        {c.lastMessage || "Say hello 👋"}
                      </span>
                      {unread > 0 && (
                        <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-clay px-1 font-syne text-[10px] font-bold text-ivory">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className={`flex-col ${selectedId ? "flex" : "hidden sm:flex"}`}>
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center font-noto text-sm text-muted">
              Select a conversation to start chatting.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-bg4 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-muted hover:text-text sm:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {otherPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
            loading="lazy" src={otherPhoto} alt={otherName} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full font-syne text-[10px] font-bold text-ivory"
                    style={{ backgroundColor: stringToColor(otherName) }}
                  >
                    {initials(otherName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block font-syne text-sm font-semibold text-text">{otherName}</span>
                  {otherUid && <SpotifyMiniPlayer uid={otherUid} />}
                </div>
                {otherUid && !blockedByMe && (
                  <BlockButton
                    targetUid={otherUid}
                    targetLabel={otherName}
                    compact
                    onBlocked={() => setBlockedUids((s) => new Set(s).add(otherUid))}
                  />
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {messages.map((m) => {
                    const isOwn = m.senderId === user.uid;
                    return (
                      <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 font-noto text-sm ${
                            isOwn ? "bg-clay text-ivory" : "bg-bg3 text-text"
                          }`}
                        >
                          {m.text}
                          <span className={`mt-1 block text-[10px] ${isOwn ? "text-ivory/70" : "text-muted"}`}>
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>

              {conversationBlocked ? (
                <div className="flex items-center justify-center gap-2 border-t border-bg4 p-4 font-noto text-sm text-muted">
                  <ShieldOff className="h-4 w-4" />
                  {blockedByMe ? "You've blocked this user." : "You can't message this user."}
                </div>
              ) : (
                <div className="flex items-end gap-2 border-t border-bg4 p-3">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Type a message..."
                    className="input-base flex-1 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !text.trim()}
                    className="btn-primary shrink-0"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
