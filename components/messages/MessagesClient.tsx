"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Copy,
  ImagePlus,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  ShieldOff,
  Shield,
  Smile,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import MentionText from "@/components/ui/MentionText";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers, isBlockedBy } from "@/lib/blocking";
import { uploadImage } from "@/lib/cloudinary";
import {
  addMembersToGroup,
  addReaction,
  createGroup,
  deleteGroup,
  deleteMessage,
  editMessage,
  hideConversationForUser,
  leaveGroup,
  makeGroupAdmin,
  markDMRead,
  removeMemberFromGroup,
  removeReaction,
  sendDM,
  setTyping,
  startConversation,
  subscribeToConversation,
  subscribeToConversations,
  subscribeToTyping,
  updateGroupInfo,
} from "@/lib/dms";
import { getUserProfile, searchUsers } from "@/lib/firestore";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import { subscribeToUserStatus, type OnlineStatus } from "@/lib/onlineStatus";
import { subscribeToStories } from "@/lib/stories";
import SpotifyMiniPlayer from "@/components/spotify/SpotifyMiniPlayer";
import { formatTime, initials, stringToColor, truncate } from "@/lib/utils";
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
  // uids with an active (unexpired) story — draws a small ring around their sidebar avatar. One
  // shared subscription for the whole list rather than per-contact, since Story docs are cheap
  // to listen to as one collection query.
  const [uidsWithStories, setUidsWithStories] = useState<Set<string>>(new Set());
  useEffect(() => {
    return subscribeToStories((grouped) => setUidsWithStories(new Set(grouped.keys())));
  }, []);
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

  // Compose modal's group-creation sub-flow: toggled on by "Create Group", off by its own back
  // arrow or by the modal closing. Search reuses composeQuery/composeResults above; this layer
  // just adds multi-select + name/photo.
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupMemberUids, setGroupMemberUids] = useState<Set<string>>(new Set());
  const [groupMemberProfiles, setGroupMemberProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [groupName, setGroupName] = useState("");
  const [groupPhotoFile, setGroupPhotoFile] = useState<File | null>(null);
  const [groupPhotoPreview, setGroupPhotoPreview] = useState<string | null>(null);
  const [creatingGroupSubmitting, setCreatingGroupSubmitting] = useState(false);

  // Group info slide-in panel (open group name/photo in the thread header) and its own
  // sub-states: adding members reuses the same search UI as compose.
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [memberActionUid, setMemberActionUid] = useState<string | null>(null);
  const [groupInfoBusy, setGroupInfoBusy] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);

  // @mention dropdown in the message input — only ever active in a group thread.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

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

  // Closes the group info panel (and its own add-members sub-flow) whenever the open
  // conversation changes, so switching threads never leaves a stale panel open on the new one.
  useEffect(() => {
    setGroupInfoOpen(false);
    setAddingMembers(false);
    setMemberActionUid(null);
    setGroupMemberUids(new Set());
    setGroupMemberProfiles(new Map());
  }, [selectedId]);

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

  // Compose modal search — small debounce so we're not re-querying on every keystroke. Also
  // backs the group info panel's "Add Members" search (its own input reuses composeQuery).
  useEffect(() => {
    if (!composeOpen && !(groupInfoOpen && addingMembers)) return;
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
  }, [composeQuery, composeOpen, groupInfoOpen, addingMembers, user]);

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

  function closeComposeModal() {
    setComposeOpen(false);
    setComposeQuery("");
    setComposeResults([]);
    setCreatingGroup(false);
    setGroupMemberUids(new Set());
    setGroupMemberProfiles(new Map());
    setGroupName("");
    setGroupPhotoFile(null);
    setGroupPhotoPreview(null);
  }

  function toggleGroupMember(u: UserProfile) {
    setGroupMemberUids((prev) => {
      const next = new Set(prev);
      if (next.has(u.uid)) next.delete(u.uid);
      else next.add(u.uid);
      return next;
    });
    setGroupMemberProfiles((prev) => {
      const next = new Map(prev);
      if (next.has(u.uid)) next.delete(u.uid);
      else next.set(u.uid, u);
      return next;
    });
  }

  function handleGroupPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGroupPhotoFile(file);
    setGroupPhotoPreview(URL.createObjectURL(file));
  }

  async function handleCreateGroup() {
    if (!user || !groupName.trim() || groupMemberUids.size === 0) return;
    setCreatingGroupSubmitting(true);
    try {
      let photoURL: string | undefined;
      if (groupPhotoFile) {
        const uploaded = await uploadImage(groupPhotoFile, `group-photos/${user.uid}`);
        photoURL = uploaded.secureUrl;
      }
      const id = await createGroup(user.uid, groupName, photoURL, Array.from(groupMemberUids));
      setSelectedId(id);
      closeComposeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the group.");
    } finally {
      setCreatingGroupSubmitting(false);
    }
  }

  const selectedGroup = conversations.find((c) => c.id === selectedId && c.type === "group");
  const isGroupAdmin = selectedGroup && user ? (selectedGroup.adminUids ?? []).includes(user.uid) : false;

  async function handleAddMembersToOpenGroup() {
    if (!user || !selectedGroup || groupMemberUids.size === 0) return;
    setGroupInfoBusy(true);
    try {
      await addMembersToGroup(selectedGroup.id, user.uid, Array.from(groupMemberUids));
      setAddingMembers(false);
      setGroupMemberUids(new Set());
      setGroupMemberProfiles(new Map());
      setComposeQuery("");
      setComposeResults([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add members.");
    } finally {
      setGroupInfoBusy(false);
    }
  }

  async function handleRemoveMember(targetUid: string) {
    if (!user || !selectedGroup) return;
    setMemberActionUid(null);
    try {
      await removeMemberFromGroup(selectedGroup.id, user.uid, targetUid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that member.");
    }
  }

  async function handleMakeAdmin(targetUid: string) {
    if (!user || !selectedGroup) return;
    setMemberActionUid(null);
    try {
      await makeGroupAdmin(selectedGroup.id, user.uid, targetUid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't promote that member.");
    }
  }

  async function handleLeaveGroup() {
    if (!user || !selectedGroup) return;
    try {
      await leaveGroup(selectedGroup.id, user.uid);
      setGroupInfoOpen(false);
      setSelectedId(null);
    } catch {
      toast.error("Couldn't leave the group.");
    }
  }

  // Beta feedback: "Allow us to delete people we no longer chat [with]" — hides the conversation
  // from this user's own sidebar only (see hideConversationForUser's doc comment); the other
  // participant's view and every message are untouched, and it reappears the next time anyone
  // sends a new message into it.
  async function handleHideConversation(conversationId: string) {
    if (!user) return;
    try {
      await hideConversationForUser(conversationId, user.uid);
      if (selectedId === conversationId) setSelectedId(null);
    } catch {
      toast.error("Couldn't remove this conversation.");
    }
  }

  async function handleDeleteGroup() {
    if (!user || !selectedGroup) return;
    try {
      await deleteGroup(selectedGroup.id, user.uid);
      setGroupInfoOpen(false);
      setSelectedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the group.");
    }
  }

  async function handleSaveGroupName() {
    if (!user || !selectedGroup || !groupNameDraft.trim()) return;
    setGroupInfoBusy(true);
    try {
      await updateGroupInfo(selectedGroup.id, user.uid, { name: groupNameDraft });
      setEditingGroupName(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename the group.");
    } finally {
      setGroupInfoBusy(false);
    }
  }

  async function handleChangeGroupPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedGroup) return;
    setGroupInfoBusy(true);
    try {
      const uploaded = await uploadImage(file, `group-photos/${user.uid}`);
      await updateGroupInfo(selectedGroup.id, user.uid, { photoURL: uploaded.secureUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the group photo.");
    } finally {
      setGroupInfoBusy(false);
      e.target.value = "";
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
    const value = e.target.value;
    setText(value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;

    // @mention dropdown, group threads only — active while the text up to the caret ends in an
    // "@" followed by zero or more non-space characters with no space since that "@".
    if (selectedGroup) {
      const upToCaret = value.slice(0, el.selectionStart ?? value.length);
      const atMatch = /(?:^|\s)@(\w*)$/.exec(upToCaret);
      setMentionQuery(atMatch ? atMatch[1] : null);
    } else {
      setMentionQuery(null);
    }

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

  function insertMention(displayName: string) {
    if (!textareaRef.current) return;
    const token = displayName.replace(/\s+/g, "");
    const el = textareaRef.current;
    const caret = el.selectionStart ?? text.length;
    const upToCaret = text.slice(0, caret);
    const replaced = upToCaret.replace(/(?:^|\s)@(\w*)$/, (m) => `${m[0] === "@" ? "" : " "}@${token} `);
    const newText = replaced + text.slice(caret);
    setText(newText);
    setMentionQuery(null);
    // Refocus so the user can keep typing right after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
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
  const isGroupThread = selected?.type === "group";
  const otherUid = selected?.participants.find((id) => id !== user.uid);
  const otherName = isGroupThread ? selected?.name ?? "Group" : (otherUid && selected?.participantNames?.[otherUid]) || "Reader";
  const otherPhoto = isGroupThread ? selected?.photoURL : otherUid ? selected?.participantPhotos?.[otherUid] : undefined;
  const otherProfileHref = otherProfile?.handle
    ? `/creator/${otherProfile.handle}`
    : otherUid
      ? `/profile/${otherUid}`
      : undefined;
  const blockedByMe = !isGroupThread && otherUid ? blockedUids.has(otherUid) : false;
  const conversationBlocked = blockedByMe || blockingMe;

  const filteredConversations = sidebarQuery.trim()
    ? conversations.filter((c) => {
        if (c.type === "group") return (c.name ?? "").toLowerCase().includes(sidebarQuery.trim().toLowerCase());
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
              const isGroup = c.type === "group";
              const other = c.participants.find((id) => id !== user.uid) ?? "";
              const name = isGroup ? c.name ?? "Group" : c.participantNames?.[other] ?? "Reader";
              const photo = isGroup ? c.photoURL : c.participantPhotos?.[other];
              const unread = c.unreadCounts?.[user.uid] ?? 0;
              const typingHere = c.id === selectedId && typingUids.length > 0;
              const typingLabel = isGroup
                ? typingUids.length === 1
                  ? `${c.participantNames?.[typingUids[0]] ?? "Someone"} is typing...`
                  : `${typingUids.length} people are typing...`
                : `${name} is typing...`;
              return (
                <div key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-bg4 py-3 pl-4 pr-10 text-left transition-colors hover:bg-bg3 ${
                    selectedId === c.id ? "bg-clay/10" : ""
                  }`}
                >
                  <div
                    className={`relative shrink-0 rounded-full ${
                      !isGroup && uidsWithStories.has(other) ? "ring-2 ring-gold ring-offset-2 ring-offset-bg2" : ""
                    }`}
                  >
                    {isGroup ? (
                      photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" src={photo} alt={name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full font-syne text-xs font-bold text-white"
                          style={{ background: stringToColor(name) }}
                        >
                          {initials(name)}
                        </div>
                      )
                    ) : (
                      <Avatar uid={other} photoURL={photo} displayName={name} size={40} />
                    )}
                    {!isGroup && playingByUid[other] && (
                      <span
                        aria-label="Currently playing on Spotify"
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg2 bg-green-500"
                      />
                    )}
                    {!isGroup && statusByUid[other]?.isOnline && (
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
                        className={`truncate font-noto text-xs ${typingHere ? "italic text-text" : "text-muted"}`}
                      >
                        {typingHere
                          ? typingLabel
                          : isGroup
                            ? c.lastMessage
                              ? `${c.participantNames?.[c.lastSenderId] ?? ""}: ${truncate(c.lastMessage, 30)}`
                              : `${(c.participants ?? []).length} members`
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHideConversation(c.id);
                  }}
                  aria-label="Delete conversation"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-70 hover:bg-bg4 hover:text-clay2 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                </div>
              );
            })
          )}
        </div>

        <div className={`h-full min-h-0 flex-col overflow-hidden ${selectedId ? "flex" : "hidden sm:flex"}`}>
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-noto text-sm text-muted">Select a conversation or start a new one.</p>
              <button type="button" onClick={() => setComposeOpen(true)} className="btn-primary text-sm">
                <Search className="h-4 w-4" /> Find someone
              </button>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-bg4 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-muted hover:text-text sm:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {isGroupThread ? (
                  <button
                    type="button"
                    onClick={() => setGroupInfoOpen(true)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {otherPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" src={otherPhoto} alt={otherName} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-syne text-[10px] font-bold text-white"
                        style={{ background: stringToColor(otherName) }}
                      >
                        {initials(otherName)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-syne text-sm font-semibold text-text">{otherName}</span>
                      <span className="font-noto text-xs text-muted">
                        {typingUids.length > 0
                          ? typingUids.length === 1
                            ? `${selected?.participantNames?.[typingUids[0]] ?? "Someone"} is typing...`
                            : `${typingUids.length} people are typing...`
                          : `${(selected?.participants ?? []).length} members`}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </button>
                ) : (
                  <>
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
                      <Link href={otherProfileHref ?? "#"} className="flex items-center gap-1 truncate font-syne text-sm font-semibold text-text hover:underline">
                        <span className="truncate">{otherName}</span>
                        {(otherProfile?.isVerified === true || otherProfile?.verified === true) && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-plat" />
                        )}
                        {otherProfile?.isPlatinum && <Star className="h-3 w-3 shrink-0 fill-gold text-gold" />}
                        {otherProfile?.handle && (
                          <span className="ml-1 font-noto text-xs font-normal text-muted">@{otherProfile.handle}</span>
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
                    {otherUid && !blockingMe && (
                      <BlockButton
                        targetUid={otherUid}
                        targetLabel={otherName}
                        compact
                        onBlocked={() => setBlockedUids((s) => new Set(s).add(otherUid))}
                        onUnblocked={() =>
                          setBlockedUids((s) => {
                            const next = new Set(s);
                            next.delete(otherUid);
                            return next;
                          })
                        }
                      />
                    )}
                  </>
                )}
              </div>

              <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
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

                    const senderName = isGroupThread ? selected?.participantNames?.[m.senderId] ?? "Reader" : otherName;
                    const senderPhoto = isGroupThread ? selected?.participantPhotos?.[m.senderId] : otherPhoto;

                    if (m.isDeleted) {
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                          {isGroupThread && !isOwn && <Avatar uid={m.senderId} photoURL={senderPhoto} displayName={senderName} size={32} />}
                          <div className="max-w-[75%] rounded-2xl bg-bg3 px-4 py-2 font-noto text-sm italic text-muted">
                            This message was deleted
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className={`group relative flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                        {isGroupThread && !isOwn && (
                          <Avatar uid={m.senderId} photoURL={senderPhoto} displayName={senderName} size={32} className="mb-1" />
                        )}
                        <div className="flex max-w-[75%] flex-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
                          {isGroupThread && !isOwn && (
                            <span className="mb-0.5 ml-1 font-noto text-[11px] font-semibold text-muted">{senderName}</span>
                          )}
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
                                <MentionText text={m.text} />
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
                <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-bg4 p-4 font-noto text-sm text-muted">
                  <ShieldOff className="h-4 w-4" />
                  {blockedByMe ? "You've blocked this user." : "You can't message this person."}
                  {blockedByMe && otherUid && (
                    <BlockButton
                      targetUid={otherUid}
                      targetLabel={otherName}
                      onUnblocked={() =>
                        setBlockedUids((s) => {
                          const next = new Set(s);
                          next.delete(otherUid);
                          return next;
                        })
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="relative shrink-0 border-t border-bg4">
                  {mentionQuery !== null && selectedGroup && (
                    <div className="absolute bottom-full left-3 z-10 mb-1 w-56 overflow-hidden rounded-xl border border-bg4 bg-bg2 shadow-lg">
                      {Object.entries(selectedGroup.participantNames ?? {})
                        .filter(([uid, name]) => uid !== user.uid && name.toLowerCase().includes(mentionQuery.toLowerCase()))
                        .slice(0, 6)
                        .map(([uid, name]) => (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => insertMention(name)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg3"
                          >
                            <Avatar uid={uid} photoURL={selectedGroup.participantPhotos?.[uid]} displayName={name} size={24} />
                            <span className="truncate font-noto text-sm text-text">{name}</span>
                          </button>
                        ))}
                    </div>
                  )}
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

      <Modal
        open={composeOpen}
        onClose={closeComposeModal}
        title={creatingGroup ? "Create group" : "New message"}
      >
        {creatingGroup ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <label className="relative shrink-0 cursor-pointer">
                {groupPhotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" src={groupPhotoPreview} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg3 text-muted">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleGroupPhotoSelect} className="hidden" />
              </label>
              <input
                autoFocus
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="input-base flex-1"
              />
            </div>

            {groupMemberProfiles.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(groupMemberProfiles.values()).map((u) => (
                  <span
                    key={u.uid}
                    className="flex items-center gap-1.5 rounded-full bg-bg3 py-1 pl-1 pr-2 font-noto text-xs text-text"
                  >
                    <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={20} />
                    {u.displayName}
                    <button type="button" onClick={() => toggleGroupMember(u)} aria-label={`Remove ${u.displayName}`}>
                      <X className="h-3 w-3 text-muted" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={composeQuery}
                onChange={(e) => setComposeQuery(e.target.value)}
                placeholder="Add members..."
                className="input-base w-full pl-9"
              />
            </div>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {composeSearching ? (
                [0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
              ) : (
                composeResults.map((u) => {
                  const picked = groupMemberUids.has(u.uid);
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => toggleGroupMember(u)}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-bg3"
                    >
                      <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-syne text-sm font-semibold text-text">{u.displayName}</span>
                        {u.handle && <span className="block truncate font-noto text-xs text-muted">@{u.handle}</span>}
                      </span>
                      {picked && <Check className="h-4 w-4 shrink-0 text-clay" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreatingGroup(false)} className="btn-ghost">
                Back
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || groupMemberUids.size === 0 || creatingGroupSubmitting}
                className="btn-primary"
              >
                {creatingGroupSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-bg4 px-3 py-2.5 text-left transition-colors hover:bg-bg3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay/15 text-clay2">
                <Users className="h-4 w-4" />
              </span>
              <span className="font-syne text-sm font-semibold text-text">Create Group</span>
            </button>

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
          </>
        )}
      </Modal>

      {selectedGroup && (
        <Modal open={groupInfoOpen} onClose={() => setGroupInfoOpen(false)} title="Group info">
          {addingMembers ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={composeQuery}
                  onChange={(e) => setComposeQuery(e.target.value)}
                  placeholder="Search people..."
                  className="input-base w-full pl-9"
                />
              </div>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {composeResults
                  .filter((u) => !selectedGroup.participants.includes(u.uid))
                  .map((u) => {
                    const picked = groupMemberUids.has(u.uid);
                    return (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => toggleGroupMember(u)}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-bg3"
                      >
                        <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={40} />
                        <span className="min-w-0 flex-1 truncate font-syne text-sm font-semibold text-text">{u.displayName}</span>
                        {picked && <Check className="h-4 w-4 shrink-0 text-clay" />}
                      </button>
                    );
                  })}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAddingMembers(false)} className="btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddMembersToOpenGroup}
                  disabled={groupMemberUids.size === 0 || groupInfoBusy}
                  className="btn-primary"
                >
                  {groupInfoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <button
                  type="button"
                  onClick={() => isGroupAdmin && groupPhotoInputRef.current?.click()}
                  disabled={!isGroupAdmin || groupInfoBusy}
                  className="relative"
                  aria-label={isGroupAdmin ? "Change group photo" : "Group photo"}
                >
                  {selectedGroup.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" src={selectedGroup.photoURL} alt="" className="h-20 w-20 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex h-20 w-20 items-center justify-center rounded-full font-cinzel text-xl font-bold text-white"
                      style={{ background: stringToColor(selectedGroup.name ?? "Group") }}
                    >
                      {initials(selectedGroup.name ?? "Group")}
                    </div>
                  )}
                  {isGroupAdmin && (
                    <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg2 bg-clay text-ivory">
                      <ImagePlus className="h-3 w-3" />
                    </span>
                  )}
                </button>
                <input ref={groupPhotoInputRef} type="file" accept="image/*" onChange={handleChangeGroupPhoto} className="hidden" />

                {editingGroupName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={groupNameDraft}
                      onChange={(e) => setGroupNameDraft(e.target.value)}
                      className="input-base text-center"
                    />
                    <button type="button" onClick={handleSaveGroupName} disabled={groupInfoBusy} aria-label="Save name">
                      <Check className="h-4 w-4 text-gold" />
                    </button>
                    <button type="button" onClick={() => setEditingGroupName(false)} aria-label="Cancel">
                      <X className="h-4 w-4 text-muted" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isGroupAdmin) return;
                      setGroupNameDraft(selectedGroup.name ?? "");
                      setEditingGroupName(true);
                    }}
                    className="font-cinzel text-lg text-text"
                  >
                    {selectedGroup.name}
                  </button>
                )}
                {selectedGroup.description && (
                  <p className="font-noto text-xs text-muted">{selectedGroup.description}</p>
                )}
                <p className="font-noto text-xs text-muted">{selectedGroup.participants.length} members</p>
              </div>

              <div className="flex items-center justify-between">
                <p className="font-syne text-xs font-semibold uppercase tracking-wide text-muted">Members</p>
                {isGroupAdmin && (
                  <button
                    type="button"
                    onClick={() => setAddingMembers(true)}
                    className="flex items-center gap-1 font-noto text-xs font-semibold text-gold hover:underline"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {selectedGroup.participants.map((uid) => {
                  const name = selectedGroup.participantNames?.[uid] ?? "Reader";
                  const photo = selectedGroup.participantPhotos?.[uid];
                  const isMemberAdmin = (selectedGroup.adminUids ?? []).includes(uid);
                  return (
                    <div key={uid} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                      <div className="relative shrink-0">
                        <Avatar uid={uid} photoURL={photo} displayName={name} size={32} />
                        {statusByUid[uid]?.isOnline && (
                          <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-bg2 bg-gold" />
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate font-noto text-sm text-text">
                        {uid === user.uid ? "You" : name}
                      </span>
                      {isMemberAdmin && <span className="font-noto text-[10px] font-semibold text-gold">Admin</span>}
                      {isGroupAdmin && uid !== user.uid && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setMemberActionUid(memberActionUid === uid ? null : uid)}
                            aria-label="Member options"
                            className="text-muted hover:text-text"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {memberActionUid === uid && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMemberActionUid(null)} />
                              <div className="glass absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg p-1">
                                {!isMemberAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleMakeAdmin(uid)}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-text hover:bg-bg4"
                                  >
                                    <Shield className="h-3.5 w-3.5" /> Make Admin
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(uid)}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-clay2 hover:bg-bg4"
                                >
                                  <X className="h-3.5 w-3.5" /> Remove from Group
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 border-t border-bg4 pt-3">
                {selectedGroup.creatorUid === user.uid ? (
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="flex items-center justify-center gap-2 rounded-lg py-2 font-noto text-sm font-semibold text-clay2 hover:bg-bg3"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Group
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLeaveGroup}
                    className="flex items-center justify-center gap-2 rounded-lg py-2 font-noto text-sm font-semibold text-clay2 hover:bg-bg3"
                  >
                    <LogOut className="h-4 w-4" /> Leave Group
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
