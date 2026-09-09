"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  ShieldOff,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers, isBlockedBy } from "@/lib/blocking";
import {
  addReaction,
  deleteMessage,
  editMessage,
  markDMRead,
  removeReaction,
  sendDM,
  setTyping,
  startConversation,
  subscribeToConversation,
  subscribeToConversations,
  subscribeToTyping,
} from "@/lib/dms";
import { getUserProfile, searchUsers } from "@/lib/firestore";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import { subscribeToUserStatus, type OnlineStatus } from "@/lib/onlineStatus";
import SpotifyMiniPlayer from "@/components/spotify/SpotifyMiniPlayer";
import { formatTime, truncate } from "@/lib/utils";
import type { Conversation, DMMessage, MessageReplyTo, UserProfile } from "@/types";

const MAX_TEXTAREA_HEIGHT = 112; // ~4 lines at this input's font/line-height + padding
/** How long to wait after the last keystroke before clearing our own typing flag. */
const TYPING_CLEAR_DELAY_MS = 2000;
/** Long-press duration (mobile) before the message context menu opens. */
const LONG_PRESS_MS = 450;
const REACTION_EMOJIS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];

/** "Online" / "Last seen 3 minutes ago" / "Last seen a while ago" for the thread header. */
function statusLabel(status: OnlineStatus | null): string {
  if (!status) return "";
  if (status.isOnline) return "Online";
  if (!status.lastSeen) return "";
  return `Last seen ${formatTime(status.lastSeen)}`;
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
  const { user, profile, loading: authLoading } = useAuth();
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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

  // uid -> real-time online status, one subscription per contact currently in the sidebar (see
  // the effect below that opens/closes these as `conversations` changes) — the conversation
  // list's dot and the active thread's "Online"/"Last seen" line both read from this.
  const [statusByUid, setStatusByUid] = useState<Record<string, OnlineStatus>>({});
  const statusUnsubsRef = useRef<Record<string, () => void>>({});
  // Who's currently typing in the OPEN conversation (never includes my own uid).
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amTypingRef = useRef(false);

  // Per-message interactions: which message's context menu is open, which one (if any) is being
  // inline-edited, the draft text for that edit, which reply this thread's draft is attached to,
  // and which message+emoji's reactor list is currently being shown.
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessageReplyTo | null>(null);
  const [reactionViewer, setReactionViewer] = useState<{ emoji: string; uids: string[] } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

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

  // Real-time typing indicator for whichever conversation is open — torn down and re-subscribed
  // whenever the selected conversation changes, and cleared (both locally and via setTyping)
  // when leaving one so a stale "typing..." can never linger in a conversation you've left.
  useEffect(() => {
    setTypingUids([]);
    if (!selectedId) return;
    const unsub = subscribeToTyping(selectedId, (uids) =>
      setTypingUids(user ? uids.filter((uid) => uid !== user.uid) : uids)
    );
    return () => {
      unsub();
      if (amTypingRef.current && user) {
        setTyping(selectedId, user.uid, false);
        amTypingRef.current = false;
      }
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // One real-time online-status subscription per contact currently in the sidebar, opened and
  // closed as `conversations` changes rather than a fixed poll — presence is cheap to listen to
  // (a single small doc per uid) and this list is rarely more than a handful of people.
  useEffect(() => {
    if (!user) return;
    const otherUids = new Set(
      conversations.map((c) => c.participants.find((id) => id !== user.uid)).filter((id): id is string => !!id)
    );
    const subs = statusUnsubsRef.current;
    for (const uid of Array.from(otherUids)) {
      if (subs[uid]) continue;
      subs[uid] = subscribeToUserStatus(uid, (status) => {
        setStatusByUid((prev) => ({ ...prev, [uid]: status }));
      });
    }
    for (const uid of Object.keys(subs)) {
      if (otherUids.has(uid)) continue;
      subs[uid]();
      delete subs[uid];
      setStatusByUid((prev) => {
        if (!(uid in prev)) return prev;
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    }
  }, [conversations, user]);

  // Unsubscribes every open online-status listener on unmount (the effect above only closes
  // ones for contacts that dropped OUT of the list, not the whole set when the page itself
  // unmounts).
  useEffect(() => {
    return () => {
      Object.values(statusUnsubsRef.current).forEach((unsub) => unsub());
      statusUnsubsRef.current = {};
    };
  }, []);

  useEffect(() => {
    // Set scrollTop directly on the message pane itself rather than bottomRef.scrollIntoView() —
    // confirmed live that scrollIntoView() was walking past this container to the outer PAGE's
    // own scroll position (since the 600px box isn't always fully within the viewport when a
    // thread opens), landing well past the input and into the site footer instead of just
    // snapping the message list to its latest message. Setting scrollTop only ever touches this
    // one element, so it can't leak into page scroll no matter where the box sits on screen.
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
    const replyTo = replyingTo ?? undefined;
    setText("");
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Sending counts as "done typing" — clear immediately rather than waiting out the debounce.
    if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    if (amTypingRef.current) {
      amTypingRef.current = false;
      setTyping(selectedId, user.uid, false);
    }
    // Optimistic: show the message immediately, before Firestore's real-time listener confirms
    // it — subscribeToConversation will replace this with the server-confirmed list the moment
    // it comes back, but the sender shouldn't have to wait a round-trip to see their own message.
    const optimistic: DMMessage = {
      id: `optimistic-${Date.now()}`,
      conversationId: selectedId,
      senderId: user.uid,
      text: value,
      createdAt: new Date().toISOString(),
      ...(replyTo ? { replyTo } : {}),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendDM(selectedId, user.uid, value, replyTo);
      // getConversations refetch isn't needed for the sidebar (subscribeToConversations already
      // picks up the updated lastMessage/lastMessageAt in real time); kept as a no-op-safe
      // read only if that ever needs a manual nudge.
    } catch {
      toast.error("Couldn't send your message.");
      setText(value);
      setReplyingTo(replyTo ?? null);
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

    if (!user || !selectedId) return;
    if (!amTypingRef.current) {
      amTypingRef.current = true;
      setTyping(selectedId, user.uid, true);
    }
    if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    typingClearTimerRef.current = setTimeout(() => {
      amTypingRef.current = false;
      setTyping(selectedId, user.uid, false);
    }, TYPING_CLEAR_DELAY_MS);
  }

  function openMenu(messageId: string) {
    setMenuForId(messageId);
  }
  function closeMenu() {
    setMenuForId(null);
  }

  // Long-press (mobile) opens the same context menu a right-click does on desktop. The "fired"
  // flag suppresses the click that a touchend otherwise also produces, so a long-press doesn't
  // also register as a tap-to-nothing right after the menu opens.
  function handleTouchStart(messageId: string) {
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      openMenu(messageId);
    }, LONG_PRESS_MS);
  }
  function handleTouchEnd() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }
  function handleContextMenu(e: React.MouseEvent, messageId: string) {
    e.preventDefault();
    openMenu(messageId);
  }

  function startEdit(m: DMMessage) {
    setEditingId(m.id);
    setEditDraft(m.text);
    closeMenu();
  }
  async function saveEdit(messageId: string) {
    if (!selectedId || !editDraft.trim()) return;
    try {
      await editMessage(selectedId, messageId, editDraft);
      setEditingId(null);
    } catch {
      toast.error("Couldn't save your edit.");
    }
  }

  async function handleDelete(messageId: string, forEveryone: boolean) {
    if (!selectedId || !user) return;
    closeMenu();
    try {
      await deleteMessage(selectedId, messageId, user.uid, forEveryone);
    } catch {
      toast.error("Couldn't delete that message.");
    }
  }

  async function handleReact(m: DMMessage, emoji: string) {
    if (!selectedId || !user) return;
    closeMenu();
    const alreadyReacted = m.reactions?.find((r) => r.emoji === emoji)?.uids.includes(user.uid);
    try {
      if (alreadyReacted) {
        await removeReaction(selectedId, m.id, user.uid, emoji);
      } else {
        await addReaction(selectedId, m.id, user.uid, emoji);
      }
    } catch {
      toast.error("Couldn't add your reaction.");
    }
  }

  function handleReply(m: DMMessage) {
    if (!user) return;
    setReplyingTo({
      messageId: m.id,
      senderName: m.senderId === user.uid ? "You" : otherNameOf(m),
      preview: truncate(m.text, 80),
    });
    closeMenu();
    textareaRef.current?.focus();
  }

  async function handleCopy(m: DMMessage) {
    closeMenu();
    try {
      await navigator.clipboard.writeText(m.text);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy that.");
    }
  }

  // `otherName` (the derived thread-header value below) isn't in scope this early in the
  // component — this small helper exists just so handleReply above can label a reply's
  // "senderName" without duplicating that lookup.
  function otherNameOf(m: DMMessage): string {
    const convo = conversations.find((c) => c.id === m.conversationId);
    const other = convo?.participants.find((id) => id !== user?.uid);
    return (other && convo?.participantNames?.[other]) || "Reader";
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
  // Messages this viewer chose "delete for me" on never even enter the list — everyone else's
  // view (including a second "delete for everyone" later) is untouched.
  const visibleMessages = messages.filter((m) => !m.deletedFor?.includes(user.uid));
  const messageItems: ({ kind: "separator"; label: string; key: string } | { kind: "message"; message: DMMessage })[] = [];
  let lastDay = "";
  for (const m of visibleMessages) {
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
                    <Avatar uid={other} photoURL={photo} displayName={name} size={40} />
                    {playingByUid[other] && (
                      <span
                        aria-label="Currently playing on Spotify"
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg2 bg-green-500"
                      />
                    )}
                    {statusByUid[other]?.isOnline && (
                      <span
                        aria-label="Online"
                        className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg2 bg-gold"
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
                      <span
                        className={`truncate font-noto text-xs ${
                          c.id === selectedId && typingUids.length > 0 ? "italic text-text" : "text-muted"
                        }`}
                      >
                        {c.id === selectedId && typingUids.length > 0
                          ? `${name} is typing...`
                          : c.lastMessage
                            ? truncate(c.lastMessage, 40)
                            : "Say hello 👋"}
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
                  <Avatar uid={otherUid} photoURL={otherPhoto} displayName={otherName} size={32} />
                  {otherUid && statusByUid[otherUid]?.isOnline && (
                    <span
                      aria-label="Online"
                      className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg ${
                        otherProfile?.isPlatinum ? "bg-plat" : "bg-gold"
                      }`}
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
                  {typingUids.length > 0 ? (
                    <p className="font-noto text-xs italic text-clay2">typing...</p>
                  ) : (
                    otherUid &&
                    statusByUid[otherUid] && (
                      <p className="font-noto text-xs text-muted">{statusLabel(statusByUid[otherUid])}</p>
                    )
                  )}
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

              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overscroll-contain p-4">
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
                    const isEditing = editingId === m.id;
                    const bubbleShape = isOwn
                      ? "rounded-tl-2xl rounded-bl-2xl rounded-tr-sm bg-clay text-ivory"
                      : "rounded-tr-2xl rounded-br-2xl rounded-tl-sm bg-bg3 text-text";

                    if (m.isDeleted) {
                      return (
                        <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[75%] rounded-2xl bg-bg3 px-4 py-2 font-noto text-sm italic text-muted">
                            This message was deleted
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className={`group relative flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className="flex max-w-[75%] flex-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
                          <div
                            onContextMenu={(e) => handleContextMenu(e, m.id)}
                            onTouchStart={() => handleTouchStart(m.id)}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchEnd}
                            className={`relative w-full px-4 py-2 font-noto text-sm ${bubbleShape}`}
                          >
                            {m.replyTo && (
                              <div
                                className={`mb-1.5 border-l-2 pl-2 text-xs ${
                                  isOwn ? "border-ivory/40 text-ivory/80" : "border-muted2 text-muted"
                                }`}
                              >
                                <p className="font-semibold">{m.replyTo.senderName}</p>
                                <p className="truncate">{m.replyTo.preview}</p>
                              </div>
                            )}

                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  autoFocus
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  rows={2}
                                  className="w-full resize-none rounded-lg border border-white/20 bg-black/20 p-2 text-sm text-inherit outline-none"
                                />
                                <div className="flex justify-end gap-2 text-xs">
                                  <button type="button" onClick={() => setEditingId(null)} className="underline">
                                    Cancel
                                  </button>
                                  <button type="button" onClick={() => saveEdit(m.id)} className="font-semibold underline">
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {m.text}
                                <span className="mt-1 flex items-center gap-1 text-[10px]">
                                  <span className={isOwn ? "text-ivory/70" : "text-muted"}>{formatTime(m.createdAt)}</span>
                                  {m.isEdited && <span className={isOwn ? "text-ivory/70" : "text-muted"}>(edited)</span>}
                                </span>
                              </>
                            )}

                            {/* Desktop affordance for the same menu long-press opens on mobile. */}
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => openMenu(m.id)}
                                aria-label="Message options"
                                className={`absolute top-1 hidden rounded-full p-1 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 sm:block ${
                                  isOwn ? "left-1" : "right-1"
                                }`}
                              >
                                <MoreHorizontal className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          {m.reactions && m.reactions.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {m.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => setReactionViewer({ emoji: r.emoji, uids: r.uids })}
                                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                                    r.uids.includes(user.uid) ? "border-clay bg-clay/15" : "border-bg4 bg-bg3"
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="text-muted">{r.uids.length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {menuForId === m.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={closeMenu} />
                            <div
                              className={`glass absolute z-50 flex w-48 flex-col gap-0.5 rounded-xl p-1.5 ${
                                isOwn ? "right-0" : "left-0"
                              } top-full mt-1`}
                            >
                              <div className="flex items-center justify-around border-b border-white/10 px-1 pb-1.5">
                                {REACTION_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleReact(m, emoji)}
                                    className="rounded p-1 text-lg hover:bg-white/10"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleReply(m)}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                              >
                                <Reply className="h-4 w-4" /> Reply
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(m)}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                              >
                                <Copy className="h-4 w-4" /> Copy
                              </button>
                              {isOwn && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(m)}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                                  >
                                    <Pencil className="h-4 w-4" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(m.id, true)}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-clay2 hover:bg-bg4"
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete for everyone
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDelete(m.id, false)}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-clay2 hover:bg-bg4"
                              >
                                <Trash2 className="h-4 w-4" /> Delete for me
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {typingUids.length > 0 && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1 rounded-tr-2xl rounded-br-2xl rounded-tl-sm bg-bg3 px-4 py-3">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {conversationBlocked ? (
                <div className="flex items-center justify-center gap-2 border-t border-bg4 p-4 font-noto text-sm text-muted">
                  <ShieldOff className="h-4 w-4" />
                  {blockedByMe ? "You've blocked this user." : "You can't message this person."}
                </div>
              ) : (
                <div className="border-t border-bg4">
                  {replyingTo && (
                    <div className="flex items-center gap-2 border-b border-bg4 bg-bg3 px-3 py-2">
                      <Reply className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1 border-l-2 border-clay pl-2">
                        <p className="font-noto text-xs font-semibold text-text">{replyingTo.senderName}</p>
                        <p className="truncate font-noto text-xs text-muted">{replyingTo.preview}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        aria-label="Cancel reply"
                        className="shrink-0 text-muted hover:text-text"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                <div
                  className="flex items-end gap-2 p-3"
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
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={reactionViewer !== null} onClose={() => setReactionViewer(null)} title={reactionViewer ? `Reacted ${reactionViewer.emoji}` : ""}>
        <div className="flex flex-col gap-2">
          {reactionViewer?.uids.map((uid) => (
            <div key={uid} className="flex items-center gap-3">
              <Avatar
                uid={uid}
                photoURL={uid === user.uid ? (profile?.photoURL ?? user.photoURL ?? undefined) : otherPhoto}
                displayName={uid === user.uid ? "You" : otherName}
                size={32}
              />
              <span className="font-noto text-sm text-text">{uid === user.uid ? "You" : otherName}</span>
            </div>
          ))}
        </div>
      </Modal>

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
                <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={40} />
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
