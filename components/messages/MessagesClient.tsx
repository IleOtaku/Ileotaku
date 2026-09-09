"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Plus, Search, Send, ShieldOff, Smile } from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import { Modal, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers, isBlockedBy } from "@/lib/blocking";
import {
  markDMRead,
  sendDM,
  startConversation,
  subscribeToConversation,
  subscribeToConversations,
} from "@/lib/dms";
import { getUserProfile, searchUsers } from "@/lib/firestore";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import SpotifyMiniPlayer from "@/components/spotify/SpotifyMiniPlayer";
import { formatTime, initials, stringToColor, truncate } from "@/lib/utils";
import type { Conversation, DMMessage, UserProfile } from "@/types";

const MAX_TEXTAREA_HEIGHT = 112; // ~4 lines at this input's font/line-height + padding

/** A viewer counts as "online" if their last recorded activity was within this window. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(lastActiveAt: string | undefined): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS;
}

/** "Today" / "Yesterday" / a weekday name / a short date — for the separators between messages
 * sent on different days, same bucketing every chat app uses. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: diffDays >= 365 ? "numeric" : undefined,
  });
}

/** Full DM page: conversation list + message thread. Protected — redirects to login if signed out. */
export default function MessagesClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // New-message compose modal: search real ÍléOtaku accounts by name/@handle, start (or resume)
  // a conversation with whoever's picked.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeQuery, setComposeQuery] = useState("");
  const [composeResults, setComposeResults] = useState<UserProfile[]>([]);
  const [composeSearching, setComposeSearching] = useState(false);
  const [composeStartingUid, setComposeStartingUid] = useState<string | null>(null);

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

  // Real-time so an incoming message bubbles that conversation to the top (with its fresh
  // preview/unread badge) without the viewer having to refresh or reselect anything.
  useEffect(() => {
    if (!user) return;
    setLoadingConvos(true);
    const unsub = subscribeToConversations(user.uid, (res) => {
      setConversations(res);
      setLoadingConvos(false);
    });
    return unsub;
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
        .then((id) => setSelectedId(id))
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
    setOtherProfile(null);
    if (!user || !selectedId) return;
    const convo = conversations.find((c) => c.id === selectedId);
    const other = convo?.participants.find((id) => id !== user.uid);
    if (!other) return;
    isBlockedBy(user.uid, other).then(setBlockingMe);
    getUserProfile(other).then(setOtherProfile).catch(() => setOtherProfile(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, user, conversations.length]);

  useEffect(() => {
    // "instant" snaps to the latest message with no animation, unlike "smooth" — the exact
    // behavior wanted on every new message, not just the thread's initial load.
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
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

  // Compose modal search — small debounce so we're not re-querying on every keystroke.
  useEffect(() => {
    if (!composeOpen) return;
    const term = composeQuery.trim();
    if (!term) {
      setComposeResults([]);
      setComposeSearching(false);
      return;
    }
    setComposeSearching(true);
    const timer = setTimeout(() => {
      searchUsers(term)
        .then((res) => setComposeResults(res.filter((u) => u.uid !== user?.uid)))
        .catch(() => setComposeResults([]))
        .finally(() => setComposeSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [composeQuery, composeOpen, user]);

  async function handleStartConversation(targetUid: string) {
    if (!user || targetUid === user.uid) return;
    setComposeStartingUid(targetUid);
    try {
      const [alreadyBlocked, blockedByThem] = await Promise.all([
        getBlockedUsers(user.uid).then((uids) => uids.includes(targetUid)),
        isBlockedBy(user.uid, targetUid),
      ]);
      if (alreadyBlocked || blockedByThem) {
        toast.error("You can't message this user.");
        return;
      }
      const id = await startConversation(user.uid, targetUid);
      setSelectedId(id);
      setComposeOpen(false);
      setComposeQuery("");
      setComposeResults([]);
    } catch {
      toast.error("Couldn't start that conversation.");
    } finally {
      setComposeStartingUid(null);
    }
  }

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
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Optimistic: show the message immediately, before Firestore's real-time listener confirms
    // it — subscribeToConversation will replace this with the server-confirmed list the moment
    // it comes back, but the sender shouldn't have to wait a round-trip to see their own message.
    const optimistic: DMMessage = {
      id: `optimistic-${Date.now()}`,
      conversationId: selectedId,
      senderId: user.uid,
      text: value,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendDM(selectedId, user.uid, value);
      // getConversations refetch isn't needed for the sidebar (subscribeToConversations already
      // picks up the updated lastMessage/lastMessageAt in real time); kept as a no-op-safe
      // read only if that ever needs a manual nudge.
    } catch {
      toast.error("Couldn't send your message.");
      setText(value);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
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

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
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
  const otherProfileHref = otherProfile?.handle
    ? `/creator/${otherProfile.handle}`
    : otherUid
      ? `/profile/${otherUid}`
      : undefined;
  const blockedByMe = otherUid ? blockedUids.has(otherUid) : false;
  const conversationBlocked = blockedByMe || blockingMe;

  const filteredConversations = sidebarQuery.trim()
    ? conversations.filter((c) => {
        const other = c.participants.find((id) => id !== user.uid) ?? "";
        const name = c.participantNames?.[other] ?? "";
        return name.toLowerCase().includes(sidebarQuery.trim().toLowerCase());
      })
    : conversations;

  // Date-separated message groups: an entry is either a message or a "day changed" marker.
  const messageItems: ({ kind: "separator"; label: string; key: string } | { kind: "message"; message: DMMessage })[] = [];
  let lastDay = "";
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    if (label !== lastDay) {
      messageItems.push({ kind: "separator", label, key: `sep-${m.id}` });
      lastDay = label;
    }
    messageItems.push({ kind: "message", message: m });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-cinzel text-2xl text-text">Messages</h1>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="btn-primary"
          aria-label="New message"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>
      <div className="grid h-[600px] overflow-hidden rounded-2xl border border-bg4 sm:grid-cols-[280px_1fr]">
        <div className={`flex-col overflow-y-auto overscroll-contain border-r border-bg4 bg-bg2 ${selectedId ? "hidden sm:flex" : "flex"}`}>
          <div className="sticky top-0 z-10 border-b border-bg4 bg-bg2 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Search conversations..."
                className="input-base w-full pl-9 text-sm"
              />
            </div>
          </div>

          {loadingConvos ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="text-4xl">💬</span>
              <p className="font-cinzel text-sm text-text">No conversations yet</p>
              <p className="font-noto text-xs text-muted">Find someone to message</p>
              <Link href="/search?tab=people" className="btn-primary mt-2 text-xs">
                Search
              </Link>
            </div>
          ) : filteredConversations.length === 0 ? (
            <p className="p-6 text-center font-noto text-xs text-muted">No conversations match &ldquo;{sidebarQuery}&rdquo;.</p>
          ) : (
            filteredConversations.map((c) => {
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
                    selectedId === c.id ? "bg-clay/10" : ""
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
                        {c.lastMessage ? truncate(c.lastMessage, 40) : "Say hello 👋"}
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
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-noto text-sm text-muted">Select a conversation or start a new one.</p>
              <button type="button" onClick={() => setComposeOpen(true)} className="btn-primary text-sm">
                <Search className="h-4 w-4" /> Find someone
              </button>
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
                <div className="relative shrink-0">
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
                  {isOnline(otherProfile?.lastActiveAt) && (
                    <span
                      aria-label="Online"
                      className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-green-500"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={otherProfileHref ?? "#"} className="block truncate font-syne text-sm font-semibold text-text hover:underline">
                    {otherName}
                    {otherProfile?.handle && (
                      <span className="ml-1.5 font-noto text-xs font-normal text-muted">@{otherProfile.handle}</span>
                    )}
                  </Link>
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

              <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                <div className="flex flex-col gap-2">
                  {messageItems.map((item) => {
                    if (item.kind === "separator") {
                      return (
                        <div key={item.key} className="my-2 flex items-center justify-center">
                          <span className="rounded-full bg-bg3 px-3 py-1 font-noto text-[10px] font-semibold uppercase tracking-wide text-muted">
                            {item.label}
                          </span>
                        </div>
                      );
                    }
                    const m = item.message;
                    const isOwn = m.senderId === user.uid;
                    return (
                      <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] px-4 py-2 font-noto text-sm ${
                            isOwn
                              ? "rounded-tl-2xl rounded-bl-2xl rounded-tr-sm bg-clay text-ivory"
                              : "rounded-tr-2xl rounded-br-2xl rounded-tl-sm bg-bg3 text-text"
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
                  {blockedByMe ? "You've blocked this user." : "You can't message this person."}
                </div>
              ) : (
                <div
                  className="flex items-end gap-2 border-t border-bg4 p-3"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  <button
                    type="button"
                    className="btn-ghost shrink-0 px-2.5"
                    aria-label="Add emoji"
                    title="Emoji picker coming soon"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleTextareaInput}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Type a message..."
                    className="input-base flex-1 resize-none overflow-y-auto"
                    style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
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

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New message">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={composeQuery}
            onChange={(e) => setComposeQuery(e.target.value)}
            placeholder="Search by name or @handle..."
            className="input-base w-full pl-9"
          />
        </div>
        <div className="flex flex-col gap-2">
          {composeSearching ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
          ) : !composeQuery.trim() ? (
            <p className="py-6 text-center font-noto text-sm text-muted">Search for someone to start a conversation.</p>
          ) : composeResults.length === 0 ? (
            <p className="py-6 text-center font-noto text-sm text-muted">No one found.</p>
          ) : (
            composeResults.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => handleStartConversation(u.uid)}
                disabled={composeStartingUid !== null}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-bg3 disabled:opacity-60"
              >
                {u.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" src={u.photoURL} alt={u.displayName} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
                    style={{ backgroundColor: stringToColor(u.displayName) }}
                  >
                    {initials(u.displayName)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-syne text-sm font-semibold text-text">{u.displayName}</span>
                  {u.handle && <span className="block truncate font-noto text-xs text-muted">@{u.handle}</span>}
                </span>
                {composeStartingUid === u.uid && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />}
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
