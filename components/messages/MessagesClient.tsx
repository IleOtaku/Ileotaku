"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  ShieldOff,
  Smile,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge } from "@/components/ui/Badges";
import { BirthdayBadge } from "@/components/ui/BirthdayBadge";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import LinkPreviewCard from "@/components/ui/LinkPreviewCard";
import MentionText, { extractFirstUrl } from "@/components/ui/MentionText";
import { Tooltip } from "@/components/ui/Tooltip";
import { isBirthdayToday } from "@/lib/birthday";
import AttachmentTray from "./AttachmentTray";
import DMMediaContent from "./DMMediaContent";
import DMSettingsPanel from "./DMSettingsPanel";
import GifPicker from "./GifPicker";
import GroupInfoPanel from "./GroupInfoPanel";
import InAppCamera from "./InAppCamera";
import { useActiveCall } from "@/hooks/useActiveCall";
import { saveSticker } from "@/lib/stickers";
import { checkMicrophonePermission, newCallId, WebRTCCall } from "@/lib/webrtc";
import SharePickerModal, { type SharedManga, type SharedPost } from "./SharePickerModal";
import StickerPicker from "./StickerPicker";
import VoiceRecorder from "./VoiceRecorder";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers, isBlockedBy } from "@/lib/blocking";
import { uploadAnyFile, uploadImage, uploadImageWithProgress, uploadVideo, uploadVoiceNote } from "@/lib/cloudinary";
import {
  addReaction,
  archiveConversation,
  clearConversationForUser,
  createGroup,
  deleteMessage,
  editMessage,
  hideConversationForUser,
  markDMRead,
  removeReaction,
  sendDM,
  setTyping,
  startConversation,
  subscribeToConversation,
  subscribeToConversations,
  subscribeToTyping,
  unarchiveConversation,
  type SendDMOptions,
} from "@/lib/dms";
import { getUserProfile, searchUsers } from "@/lib/firestore";
import { getNowPlayingOnce } from "@/lib/nowPlaying";
import { subscribeToUserStatus, type OnlineStatus } from "@/lib/onlineStatus";
import { subscribeToStories } from "@/lib/stories";
import type { TenorGif } from "@/lib/tenor";
import SpotifyMiniPlayer from "@/components/spotify/SpotifyMiniPlayer";
import { contrastTextColor, formatExactTime, formatPostTimestamp, formatTime, initials, stringToColor, truncate } from "@/lib/utils";
import type { Conversation, DMMessage, MessageReplyTo, UserProfile } from "@/types";

const MAX_TEXTAREA_HEIGHT = 112; // ~4 lines at this input's font/line-height + padding
/** How long to wait after the last keystroke before clearing our own typing flag. */
const TYPING_CLEAR_DELAY_MS = 2000;
/** Long-press duration (mobile) before the message context menu opens. */
const LONG_PRESS_MS = 450;
const REACTION_EMOJIS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];
const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😍", "👏", "😢", "😮", "🙏", "💯", "🎉", "😊", "👀"];

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
  // DM Feature Overhaul (Part I): collapsed by default, per the feature spec.
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  // 5-tier verification overhaul: the sidebar conversation list only denormalizes
  // participantNames/Photos (strings) onto each Conversation — same gap propagateProfileChange
  // already leaves for display-name/photo staleness there, so this follows the same precedent
  // (an on-demand, additive-only cache) rather than a new denormalize-and-propagate write path.
  const [otherParticipantProfiles, setOtherParticipantProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [messages, setMessages] = useState<DMMessage[]>([]);
  // DM Feature Overhaul (Part C/D): per-session cache of every sender's bubble style/color
  // preferences, so the message list can render each sender's OWN look (a group chat naturally
  // ends up with every member's bubbles styled differently) without a per-message profile fetch.
  // "Cached per-session to avoid excessive Firestore reads" per the feature spec — additive-only,
  // same pattern as otherParticipantProfiles above.
  const [senderProfiles, setSenderProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Beta feedback bug: "The emoji button doesn't work" — it rendered with no onClick at all,
  // just a "coming soon" tooltip. Same QUICK_EMOJIS-grid pattern FeedCommentSheet's own (already
  // working) emoji button uses.
  const [emojiOpen, setEmojiOpen] = useState(false);
  // DM Feature Overhaul (Part A): attachment tray + every picker/overlay it can open.
  const [attachmentTrayOpen, setAttachmentTrayOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [sharePickerMode, setSharePickerMode] = useState<"manga" | "post" | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [mediaUploading, setMediaUploading] = useState<{ percent: number; label: string } | null>(null);
  const photoVideoInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  // DM Feature Overhaul (Part F): the slide-in DM Settings panel, opened from the header menu.
  const [dmSettingsOpen, setDmSettingsOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handledWithParam = useRef(false);
  const handledOpenParam = useRef(false);
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
  // WhatsApp-style Group Info redesign: this now opens GroupInfoPanel, a dedicated component
  // that owns essentially all of its own member/settings/media state internally.
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  // Beta feedback: "...and also a clear conversation button" — a small menu on the open thread's
  // own header, distinct from the sidebar row's hide/delete-conversation icon.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // 5-tier verification overhaul: the group roster only denormalizes participantNames/Photos
  // (strings) onto the Conversation doc, not verification data — fetched on demand instead of a
  // full schema/write-path change, since a group's member list is small and only loaded while its
  // own info panel is actually open. Still fetched here (rather than inside GroupInfoPanel
  // itself) since MessagesClient already had this exact effect and pattern established.
  const [participantProfiles, setParticipantProfiles] = useState<Map<string, UserProfile>>(new Map());

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

  // 5-tier verification overhaul: fetches (and caches, additively — never refetches a uid it
  // already has) the badge-relevant fields for every DM's other participant, so the sidebar list
  // can show a verification badge next to each name.
  useEffect(() => {
    if (!user) return;
    const otherUids = Array.from(
      new Set(
        conversations
          .filter((c) => c.type !== "group")
          .map((c) => c.participants.find((id) => id !== user.uid))
          .filter((id): id is string => !!id)
      )
    );
    const missing = otherUids.filter((uid) => !otherParticipantProfiles.has(uid));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((uid) => getUserProfile(uid).then((p) => [uid, p] as const))).then((results) => {
      if (cancelled) return;
      setOtherParticipantProfiles((prev) => {
        const next = new Map(prev);
        results.forEach(([uid, p]) => {
          if (p) next.set(uid, p);
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, user]);

  // Closes the group info panel whenever the open conversation changes, so switching threads
  // never leaves a stale panel open on the new one — GroupInfoPanel resets its own internal
  // sub-flow state (add-members, member-action menu, etc.) on its own `open` prop instead.
  useEffect(() => {
    setGroupInfoOpen(false);
    setGroupMemberUids(new Set());
    setGroupMemberProfiles(new Map());
    setHeaderMenuOpen(false);
  }, [selectedId]);

  // ?open=[conversationId] — from the invite-link join page (app/invite/[code]), right after it
  // adds the visitor as a participant server-side. Just selects it; subscribeToConversations'
  // own live listener is what actually makes the new group show up in the sidebar.
  useEffect(() => {
    if (!user || handledOpenParam.current) return;
    const openId = searchParams.get("open");
    if (!openId) return;
    handledOpenParam.current = true;
    setSelectedId(openId);
  }, [user, searchParams]);

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
    // Beta feedback: unread badges kept climbing for a conversation the viewer was actively
    // looking at, because markDMRead only ever ran once, on open — a message that arrived a
    // second later still bumped unreadCounts (sendDM has no notion of "recipient is already
    // staring at this thread") and nothing zeroed it back out. Re-marking read on every message
    // snapshot, not just on open, keeps the count at 0 for as long as this conversation stays
    // selected.
    const unsub = subscribeToConversation(
      selectedId,
      (msgs) => {
        setMessages(msgs);
        if (user) markDMRead(selectedId, user.uid).catch(() => {});
      },
      () => setMessages([])
    );
    if (user) markDMRead(selectedId, user.uid).catch(() => {});
    return unsub;
  }, [selectedId, user]);

  // DM Feature Overhaul (Part C/D): fetches (additively) every message sender's profile, for
  // their bubbleStyle/bubbleColor — see senderProfiles' own doc comment above.
  useEffect(() => {
    const missing = Array.from(new Set(messages.map((m) => m.senderId))).filter(
      (uid) => !senderProfiles.has(uid)
    );
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((uid) => getUserProfile(uid).then((p) => [uid, p] as const))).then((results) => {
      if (cancelled) return;
      setSenderProfiles((prev) => {
        const next = new Map(prev);
        results.forEach(([uid, p]) => {
          if (p) next.set(uid, p);
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

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
  // GroupInfoPanel (the group info redesign) now runs its own independent add-members search
  // rather than sharing this state.
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

  // PART 5 — voice calls: initiates a call from the open thread's own phone icon (1:1 only).
  async function handleStartCall(targetUid: string, targetName: string, targetPhoto: string | undefined) {
    if (!user) return;
    if (useActiveCall.getState().callId) {
      toast.error("You're already on a call.");
      return;
    }
    // Beta feedback bug: "we can't hear each other on calls" — checked up front so a mic the
    // browser already knows is blocked never gets as far as showing a ringing/calling screen.
    if ((await checkMicrophonePermission()) === "denied") {
      toast.error("Please enable microphone access in your browser settings to make a call.");
      return;
    }
    const callId = newCallId();
    const call = new WebRTCCall(callId);
    useActiveCall.getState().start(callId, call, { uid: targetUid, displayName: targetName, photoURL: targetPhoto }, "outgoing", "ringing");
    try {
      await call.startCall(user.uid, targetUid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the call — check your microphone permissions.");
      useActiveCall.getState().reset();
    }
  }

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
  const groupParticipantsKey = selectedGroup?.participants.join(",") ?? "";

  // 5-tier verification overhaul: fetches full profiles for the group roster's badges — see
  // participantProfiles' own doc comment above for why this is on-demand rather than denormalized.
  useEffect(() => {
    if (!groupInfoOpen || !groupParticipantsKey) {
      setParticipantProfiles(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(groupParticipantsKey.split(",").map((uid) => getUserProfile(uid))).then((profiles) => {
      if (cancelled) return;
      const map = new Map<string, UserProfile>();
      profiles.forEach((p, i) => {
        if (p) map.set(groupParticipantsKey.split(",")[i], p);
      });
      setParticipantProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [groupInfoOpen, groupParticipantsKey]);

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

  // Beta feedback: "...and also a clear conversation button." Empties the thread's history for
  // this user only — see clearConversationForUser's own doc comment for how it differs from
  // hideConversationForUser above.
  async function handleClearConversation() {
    if (!user || !selectedId) return;
    setClearing(true);
    try {
      await clearConversationForUser(selectedId, user.uid);
      setHeaderMenuOpen(false);
      toast.success("Conversation cleared.");
    } catch {
      toast.error("Couldn't clear this conversation.");
    } finally {
      setClearing(false);
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
      await sendDM(selectedId, user.uid, value, { replyTo });
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

  // DM Feature Overhaul (Part A): shared guard + send path for every non-text attachment type —
  // handleSend above stays text-only (it's also the Enter-key path, which media messages never
  // go through) rather than growing branches for each media kind.
  function blockedFromSending(): boolean {
    if (!user || !selectedId) return true;
    const other = conversations.find((c) => c.id === selectedId)?.participants.find((id) => id !== user.uid);
    if ((other && blockedUids.has(other)) || blockingMe) {
      toast.error("You can't message this user.");
      return true;
    }
    return false;
  }

  async function sendMediaMessage(options: SendDMOptions) {
    if (!user || !selectedId || blockedFromSending()) return;
    try {
      await sendDM(selectedId, user.uid, "", options);
    } catch {
      toast.error("Couldn't send that.");
    }
  }

  // Beta feedback bug: "Some users can't send a photo or video and it reflects... it just sends
  // without the video or photo." Couldn't reproduce a specific device/file combination, so per
  // "if intermittent, add better error handling so it fails gracefully": this now (1) rejects a
  // file whose type isn't recognizably image/video up front, with a clear message, rather than
  // silently attempting an upload the wrong Cloudinary endpoint may or may not accept, and (2)
  // never calls sendMediaMessage with an empty/missing secureUrl — previously, if a Cloudinary
  // response somehow came back "successful" without a usable URL, that gap would have gone
  // straight through as an empty-media message instead of surfacing an error.
  async function handlePhotoVideoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !selectedId || blockedFromSending()) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error(
        file.type === "image/heic" || file.type === "image/heif"
          ? "HEIC photos aren't supported yet — try converting to JPEG first."
          : "That file type isn't supported — pick a photo or video."
      );
      return;
    }
    setMediaUploading({ percent: 0, label: isVideo ? "Uploading video..." : "Uploading photo..." });
    try {
      const { secureUrl } = isVideo
        ? await uploadVideo(file, `dms/${selectedId}`, (p) => setMediaUploading({ percent: p, label: "Uploading video..." }))
        : await uploadImageWithProgress(file, `dms/${selectedId}`, (p) => setMediaUploading({ percent: p, label: "Uploading photo..." }));
      if (!secureUrl) throw new Error("Upload returned no URL.");
      await sendMediaMessage({ mediaType: isVideo ? "video" : "image", mediaUrl: secureUrl });
    } catch {
      toast.error("Couldn't upload that file. Please try again.");
    } finally {
      setMediaUploading(null);
    }
  }

  async function handleAnyFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !selectedId || blockedFromSending()) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be under 25MB.");
      return;
    }
    setMediaUploading({ percent: 0, label: "Uploading file..." });
    try {
      const { secureUrl } = await uploadAnyFile(file, `dms/${selectedId}`, (p) => setMediaUploading({ percent: p, label: "Uploading file..." }));
      await sendMediaMessage({ mediaType: "file", mediaUrl: secureUrl, mediaFileName: file.name, mediaSize: file.size });
    } catch {
      toast.error("Couldn't upload that file.");
    } finally {
      setMediaUploading(null);
    }
  }

  async function handleCameraCapture(file: File) {
    if (!user || !selectedId || blockedFromSending()) return;
    setMediaUploading({ percent: 0, label: "Uploading photo..." });
    try {
      const { secureUrl } = await uploadImageWithProgress(file, `dms/${selectedId}`, (p) => setMediaUploading({ percent: p, label: "Uploading photo..." }));
      await sendMediaMessage({ mediaType: "image", mediaUrl: secureUrl });
    } catch {
      toast.error("Couldn't upload that photo.");
    } finally {
      setMediaUploading(null);
    }
  }

  async function handleVoiceSend(blob: Blob, durationSeconds: number) {
    setVoiceMode(false);
    if (!user || !selectedId || blockedFromSending()) return;
    setMediaUploading({ percent: 0, label: "Uploading voice message..." });
    try {
      const { secureUrl } = await uploadVoiceNote(blob, `dms/${selectedId}/voice`, (p) =>
        setMediaUploading({ percent: p, label: "Uploading voice message..." })
      );
      await sendMediaMessage({ mediaType: "voice", mediaUrl: secureUrl, mediaDuration: durationSeconds });
    } catch {
      toast.error("Couldn't send that voice message.");
    } finally {
      setMediaUploading(null);
    }
  }

  function handleGifSelected(gif: TenorGif) {
    sendMediaMessage({ mediaType: "gif", mediaUrl: gif.fullUrl, mediaWidth: gif.width, mediaHeight: gif.height });
  }

  function handleStickerSelected(sticker: string) {
    sendMediaMessage({ mediaType: "sticker", mediaUrl: sticker });
  }

  function handleShareSelected(item: SharedManga | SharedPost) {
    setSharePickerMode(null);
    if (item.kind === "manga") {
      sendMediaMessage({ sharedMangaId: item.id, sharedMangaTitle: item.title, sharedMangaCoverURL: item.coverURL });
    } else {
      sendMediaMessage({
        sharedPostId: item.id,
        sharedPostAuthorName: item.authorName,
        sharedPostPreviewText: item.previewText,
        ...(item.mediaUrl ? { sharedPostMediaUrl: item.mediaUrl } : {}),
      });
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

  // PART 6 — sticker packs: "Long press on received sticker → 'Save Sticker' option."
  async function handleSaveSticker(stickerUrl: string) {
    closeMenu();
    if (!user) return;
    await saveSticker(user.uid, stickerUrl);
    toast.success("Sticker saved!");
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
  // DM Feature Overhaul (Part E): a nickname is private to whoever set it — it stands in for the
  // real display name in the thread header (and anywhere else this component shows the contact's
  // name) for the viewer who set it, nobody else, and only for a 1:1 thread (a group's own name
  // isn't a "contact" to nickname).
  const displayName =
    !isGroupThread && user && otherUid && selected?.nicknames?.[user.uid]?.[otherUid]
      ? selected.nicknames[user.uid][otherUid]
      : otherName;
  const otherPhoto = isGroupThread ? selected?.photoURL : otherUid ? selected?.participantPhotos?.[otherUid] : undefined;
  const otherProfileHref = otherProfile?.handle
    ? `/creator/${otherProfile.handle}`
    : otherUid
      ? `/profile/${otherUid}`
      : undefined;
  const blockedByMe = !isGroupThread && otherUid ? blockedUids.has(otherUid) : false;
  const conversationBlocked = blockedByMe || blockingMe;

  const searchFiltered = sidebarQuery.trim()
    ? conversations.filter((c) => {
        if (c.type === "group") return (c.name ?? "").toLowerCase().includes(sidebarQuery.trim().toLowerCase());
        const other = c.participants.find((id) => id !== user.uid) ?? "";
        const name = c.participantNames?.[other] ?? "";
        return name.toLowerCase().includes(sidebarQuery.trim().toLowerCase());
      })
    : conversations;
  // DM Feature Overhaul (Part I): archived conversations move into their own collapsed section
  // rather than the main list — getConversations/subscribeToConversations don't filter archivedBy
  // out (unlike hiddenFor, which really does hide), since "archived" is a display bucket, not a
  // removal.
  const filteredConversations = searchFiltered.filter((c) => !c.archivedBy?.[user.uid]);
  const archivedConversations = searchFiltered.filter((c) => !!c.archivedBy?.[user.uid]);

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
              // DM Feature Overhaul (Part E): the conversation list shows a saved nickname too.
              const name = isGroup ? c.name ?? "Group" : c.nicknames?.[user.uid]?.[other] ?? c.participantNames?.[other] ?? "Reader";
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
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate font-syne text-sm font-semibold text-text">{name}</span>
                        {!isGroup && <VerificationBadge user={otherParticipantProfiles.get(other)} size={12} />}
                        {!isGroup && <BirthdayBadge birthday={otherParticipantProfiles.get(other)?.birthday} size={12} />}
                      </span>
                      <span className="shrink-0 font-noto text-[10px] text-muted">
                        {formatPostTimestamp(c.lastMessageAt)}
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
                {/* DM Feature Overhaul (Part I): "Long press... → Archive" — a hover-revealed
                    icon button alongside the existing delete one, same discoverability pattern,
                    since a press-and-hold gesture has no real desktop equivalent. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveConversation(c.id, user.uid);
                  }}
                  aria-label="Archive conversation"
                  className="absolute right-10 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-70 hover:bg-bg4 hover:text-text sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Archive className="h-3.5 w-3.5" />
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

          {/* DM Feature Overhaul (Part I): collapsed by default. */}
          {archivedConversations.length > 0 && (
            <div className="border-t border-bg4">
              <button
                type="button"
                onClick={() => setArchivedOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 font-syne text-xs font-semibold text-muted"
              >
                <span className="flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5" /> Archived ({archivedConversations.length})
                </span>
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${archivedOpen ? "rotate-90" : ""}`} />
              </button>
              {archivedOpen &&
                archivedConversations.map((c) => {
                  const isGroup = c.type === "group";
                  const other = c.participants.find((id) => id !== user.uid) ?? "";
                  const name = isGroup ? c.name ?? "Group" : c.nicknames?.[user.uid]?.[other] ?? c.participantNames?.[other] ?? "Reader";
                  const photo = isGroup ? c.photoURL : c.participantPhotos?.[other];
                  return (
                    <div key={c.id} className="group relative flex items-center gap-3 border-b border-bg4 py-3 pl-4 pr-10 opacity-70">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" src={photo} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-syne text-xs font-bold text-white"
                          style={{ background: stringToColor(name) }}
                        >
                          {initials(name)}
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate font-syne text-sm font-semibold text-text">{name}</span>
                      <button
                        type="button"
                        onClick={() => unarchiveConversation(c.id, user.uid)}
                        aria-label="Unarchive conversation"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-bg4 hover:text-text"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
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
                        <span className="truncate">{displayName}</span>
                        <VerificationBadge user={otherProfile} size={14} />
                        <PlatinumBadge isPlatinum={otherProfile?.isPlatinum} className="h-3.5 w-3.5" />
                        <BirthdayBadge birthday={otherProfile?.birthday} size={14} />
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
                    {/* PART 5 — voice calls: direct conversations only, not groups yet. */}
                    {otherUid && !blockingMe && (
                      <button
                        type="button"
                        onClick={() => handleStartCall(otherUid, otherName, otherPhoto)}
                        aria-label="Voice call"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg4 hover:text-text"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}

                {/* DM Feature Overhaul (Part H): "Show a timer icon in thread header when
                    disappearing messages is active." */}
                {selected?.disappearingMessages?.enabled && (
                  <Tooltip content="Disappearing messages are on">
                    <span className="shrink-0 text-muted">
                      <Clock className="h-4 w-4" />
                    </span>
                  </Tooltip>
                )}

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setHeaderMenuOpen((o) => !o)}
                    aria-label="Conversation options"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg4 hover:text-text"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {headerMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setHeaderMenuOpen(false)} />
                      <div className="glass absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl p-1.5">
                        {/* DM Feature Overhaul (Part F). */}
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setDmSettingsOpen(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                        >
                          <Settings className="h-4 w-4" /> Chat Settings
                        </button>
                        {/* DM Feature Overhaul (Part I). */}
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            if (selectedId && user) archiveConversation(selectedId, user.uid).then(() => setSelectedId(null));
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                        >
                          <Archive className="h-4 w-4" /> Archive
                        </button>
                        {/* Beta feedback: "...and also a clear conversation button." */}
                        <button
                          type="button"
                          onClick={handleClearConversation}
                          disabled={clearing}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-clay2 hover:bg-bg4 disabled:opacity-50"
                        >
                          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Clear conversation
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* DM Feature Overhaul (Part B): the wallpaper (same for every participant, live via
                  onSnapshot on the conversation doc itself) renders as this container's own
                  background — an image uses background-image/cover, a color/gradient just goes
                  straight into `background` since both are valid CSS values there. The blur
                  overlay sits on its own layer between the wallpaper and the actual message
                  content so bubbles stay crisp/readable regardless of the wallpaper. */}
              <div
                className="relative min-h-0 flex-1"
                style={
                  selected?.wallpaperUrl
                    ? selected.wallpaperType === "image"
                      ? { backgroundImage: `url(${selected.wallpaperUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : { background: selected.wallpaperUrl }
                    : undefined
                }
              >
                {/* Beta feedback bug: "the blur moves alongside chats, it should be static." The
                    blur overlay used to be a child of the scrolling messages div itself — an
                    absolutely-positioned descendant's containing block scrolls right along with
                    that div's own content, so `inset-0` was anchored to the top of the whole
                    scrollable history, not the visible viewport, and the overlay drifted out of
                    view as soon as you scrolled. It now lives on this OUTER, non-scrolling
                    wrapper instead, with the actual overflow-y-auto div nested inside it, so the
                    overlay's containing block never moves. */}
                {selected?.wallpaperUrl && selected.wallpaperBlur && (
                  <div className="pointer-events-none absolute inset-0 bg-bg/40" style={{ backdropFilter: "blur(8px)" }} />
                )}
                <div
                  ref={messagesContainerRef}
                  className="relative h-full overflow-y-auto overscroll-contain p-4"
                >
                {/* Beta feedback: a birthday feature — "If you open a DM with someone on their
                    birthday: show a subtle banner at top of chat." Uses the nickname-aware
                    `displayName` (not the raw otherName) so it reads naturally either way. */}
                {!isGroupThread && isBirthdayToday(otherProfile?.birthday) && (
                  <div className="relative z-10 mb-3 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-gold/20 to-clay/20 px-3 py-1.5 text-center font-noto text-[11px] text-text">
                    🎂 Today is {displayName}&apos;s birthday!
                  </div>
                )}
                {/* DM Feature Overhaul (Part H): "Disappearing messages are on..." banner. */}
                {selected?.disappearingMessages?.enabled && (
                  <div className="relative z-10 mb-3 flex items-center justify-center gap-1.5 rounded-full bg-bg2/90 px-3 py-1.5 text-center font-noto text-[11px] text-muted">
                    <Clock className="h-3 w-3 shrink-0" />
                    Disappearing messages are on — messages delete after{" "}
                    {selected.disappearingMessages.duration >= 86400000
                      ? `${Math.round(selected.disappearingMessages.duration / 86400000)} day(s)`
                      : `${Math.round(selected.disappearingMessages.duration / 3600000)} hour(s)`}
                  </div>
                )}
                <div className="relative z-10 flex flex-col gap-2">
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
                    if (m.isSystem) {
                      return (
                        <div key={m.id} className="my-1 flex items-center justify-center">
                          <span className="rounded-full bg-bg3/60 px-3 py-1 text-center font-noto text-[11px] text-muted">
                            {m.text}
                          </span>
                        </div>
                      );
                    }
                    const isOwn = m.senderId === user.uid;
                    const isEditing = editingId === m.id;
                    // DM Feature Overhaul (Parts C/D): a sender's own bubbleStyle/bubbleColor
                    // (Platinum-exclusive, set from BubbleStylePicker/ChatColorPicker) overrides
                    // the plain default look — a chat-specific color (selected?.participantColors)
                    // takes priority over that sender's universal default, per the feature spec.
                    const senderPrefs = isOwn ? profile?.dmPreferences : senderProfiles.get(m.senderId)?.dmPreferences;
                    const bubbleStyleNum = selected?.participantBubbleStyles?.[m.senderId] ?? senderPrefs?.bubbleStyle;
                    const bubbleColor = selected?.participantColors?.[m.senderId] ?? senderPrefs?.bubbleColor;
                    // Beta feedback bug: "bubble styles all look the same" — the `message-bubble`
                    // class here has nothing to do with layout; it exists so globals.css's
                    // `.message-bubble.bubble-style-N` selectors have something to match (see the
                    // comment there for why a bare `.bubble-style-N` selector alone wasn't enough).
                    const bubbleShape = bubbleStyleNum
                      ? `message-bubble bubble-style-${bubbleStyleNum} ${!isOwn ? "other" : ""} ${bubbleColor ? "" : isOwn ? "bg-clay text-ivory" : "bg-bg3 text-text"}`
                      : isOwn
                        ? "message-bubble rounded-tl-2xl rounded-bl-2xl rounded-tr-sm bg-clay text-ivory"
                        : "message-bubble rounded-tr-2xl rounded-br-2xl rounded-tl-sm bg-bg3 text-text";
                    // `background` (not backgroundColor) so a gradient string works here too, not
                    // just a plain hex color — both are valid values for the shorthand.
                    // Styles 6 and 10 draw NO fill (outline / underline only), so the usual
                    // contrastTextColor-against-the-fill text color would be wrong — it'd put dark
                    // text on the near-black chat background. For those the chosen color becomes the
                    // text/outline color itself. `--bubble-color` feeds style 9's glow.
                    const isOutlineStyle = bubbleStyleNum === 6 || bubbleStyleNum === 10;
                    const bubbleInlineStyle = bubbleColor
                      ? ({
                          background: bubbleColor,
                          color: isOutlineStyle && bubbleColor.startsWith("#") ? bubbleColor : contrastTextColor(bubbleColor),
                          "--bubble-color": bubbleColor.startsWith("#") ? bubbleColor : undefined,
                        } as CSSProperties)
                      : undefined;

                    // DM Feature Overhaul (Part E): a group sender's name is nickname-able too —
                    // nicknames[viewerUid][senderId] only ever shows a nickname the current
                    // viewer themselves set for that specific member, matching how it's private.
                    const senderName = isGroupThread
                      ? (user && selected?.nicknames?.[user.uid]?.[m.senderId]) ?? selected?.participantNames?.[m.senderId] ?? "Reader"
                      : displayName;
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
                            style={bubbleInlineStyle}
                            className={`relative w-full px-4 py-2 font-noto text-sm ${bubbleShape}`}
                          >
                            {m.replyTo && (
                              <div
                                className={`mb-1.5 border-l-2 pl-2 text-xs ${
                                  // Beta feedback bug: bubble-color contrast. `text-ivory`/
                                  // `border-ivory` assumed every "own" bubble is dark — once a
                                  // light bubbleColor is picked, the outer bubble's own text
                                  // correctly flips via contrastTextColor (see bubbleInlineStyle
                                  // above), but these hardcoded ivory children didn't, leaving
                                  // white-on-white. `text-inherit`/`border-current` instead
                                  // follow whatever color the bubble actually resolved to.
                                  isOwn ? "border-current/40 text-inherit opacity-80" : "border-muted2 text-muted"
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
                                <DMMediaContent message={m} isOwn={isOwn} />
                                {m.text && <MentionText text={m.text} />}
                                {/* Beta feedback: "Links should be clickable, show the preview
                                    and should be formatted to be shorter." Clickable+shortened is
                                    MentionText's own job above; this is the preview itself. */}
                                {m.text && extractFirstUrl(m.text) && (
                                  <LinkPreviewCard url={extractFirstUrl(m.text)!} className="mt-1.5" />
                                )}
                                <span className="mt-1 flex items-center gap-1 text-[10px]">
                                  {/* Beta feedback bug: "Show exact time stamps of messages, not
                                      'about 2 minutes ago'." A day separator already labels which
                                      day each group of messages is from (see dayLabel below), so
                                      a per-message clock time is unambiguous on its own. */}
                                  <span className={isOwn ? "text-inherit opacity-70" : "text-muted"}>{formatExactTime(m.createdAt)}</span>
                                  {m.isEdited && <span className={isOwn ? "text-inherit opacity-70" : "text-muted"}>(edited)</span>}
                                  {m.expiresAt && <Clock className="h-2.5 w-2.5 opacity-60" />}
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
                            {/* Beta feedback bug: "When i touch the three dots on desktop view
                                on a chat, it should bring the popup directly underneath the
                                dots, not underneath the post." This menu is a sibling of the
                                dots button inside the same `relative` bubble container — anchoring
                                it at `top-full` (the BOTTOM of the whole bubble) put it far below
                                the dots on any multi-line message, since the dots button itself
                                sits pinned near the TOP of the bubble (`top-1`), not the bottom.
                                `top-7` instead sits it right under the dots button regardless of
                                how tall the message content above it is. */}
                            <div
                              className={`glass absolute top-7 z-50 flex w-48 flex-col gap-0.5 rounded-xl p-1.5 ${
                                isOwn ? "right-0" : "left-0"
                              }`}
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
                              {/* PART 6 — sticker packs: "Long press on received sticker →
                                  'Save Sticker' option." */}
                              {m.mediaType === "sticker" && m.mediaUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveSticker(m.mediaUrl!)}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                                >
                                  <Star className="h-4 w-4" /> Save Sticker
                                </button>
                              )}
                              {isOwn && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(m)}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                                >
                                  <Pencil className="h-4 w-4" /> Edit
                                </button>
                              )}
                              {(isOwn || isGroupAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(m.id, true)}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-clay2 hover:bg-bg4"
                                >
                                  <Trash2 className="h-4 w-4" /> Delete for everyone
                                </button>
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
                      {/* Beta feedback: "add an @all to tag everyone in a gc" */}
                      {"all".includes(mentionQuery.toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => insertMention("all")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg3"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay text-ivory">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate font-noto text-sm font-semibold text-text">All</span>
                        </button>
                      )}
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
                {emojiOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-bg4 bg-bg2 p-3">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setText((t) => t + emoji);
                          // Match handleTextareaInput's auto-grow so the textarea doesn't stay a
                          // stale height after an emoji-only insert (which skips that handler,
                          // since it's triggered by a button click, not a real input event).
                          requestAnimationFrame(() => {
                            const el = textareaRef.current;
                            if (!el) return;
                            el.style.height = "auto";
                            el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
                            el.focus();
                          });
                        }}
                        className="text-xl"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {mediaUploading && (
                  <div className="flex items-center gap-2 border-t border-bg4 bg-bg2 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-clay" />
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
                      <div className="h-full bg-clay transition-all" style={{ width: `${mediaUploading.percent}%` }} />
                    </div>
                    <span className="shrink-0 font-noto text-[10px] text-muted">{mediaUploading.label}</span>
                  </div>
                )}
                <AttachmentTray
                  open={attachmentTrayOpen}
                  onClose={() => setAttachmentTrayOpen(false)}
                  onCamera={() => setCameraOpen(true)}
                  onPhotoVideo={() => photoVideoInputRef.current?.click()}
                  onVoice={() => setVoiceMode(true)}
                  onFile={() => anyFileInputRef.current?.click()}
                  onShareManga={() => setSharePickerMode("manga")}
                  onSharePost={() => setSharePickerMode("post")}
                  onGif={() => setGifPickerOpen(true)}
                  onSticker={() => setStickerPickerOpen(true)}
                />
                <input ref={photoVideoInputRef} type="file" accept="image/*,video/*" onChange={handlePhotoVideoPicked} className="hidden" />
                <input ref={anyFileInputRef} type="file" onChange={handleAnyFilePicked} className="hidden" />
                <div
                  className="flex items-end gap-2 p-3"
                  style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  {voiceMode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setVoiceMode(false)}
                        aria-label="Cancel voice message"
                        className="btn-ghost shrink-0 px-2.5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <VoiceRecorder maxSeconds={profile?.isPlatinum ? 600 : 120} onSend={handleVoiceSend} />
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setAttachmentTrayOpen((o) => !o)}
                        className="btn-ghost shrink-0 px-2.5"
                        aria-label="Add attachment"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmojiOpen((o) => !o)}
                        className="btn-ghost shrink-0 px-2.5"
                        aria-label="Add emoji"
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
                    </>
                  )}
                </div>
                </div>
              )}
            </>
          )}

          <InAppCamera open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={handleCameraCapture} />
          <GifPicker open={gifPickerOpen} onClose={() => setGifPickerOpen(false)} onSelect={handleGifSelected} />
          <StickerPicker open={stickerPickerOpen} onClose={() => setStickerPickerOpen(false)} onSelect={handleStickerSelected} />
          {sharePickerMode && (
            <SharePickerModal
              open
              mode={sharePickerMode}
              onClose={() => setSharePickerMode(null)}
              onSelect={handleShareSelected}
            />
          )}
        </div>
      </div>

      <Modal open={reactionViewer !== null} onClose={() => setReactionViewer(null)} title={reactionViewer ? `Reacted ${reactionViewer.emoji}` : ""}>
        <div className="flex flex-col gap-2">
          {reactionViewer?.uids.map((uid) => {
            // Beta feedback: "Reactions on groups doesn't show who reacted" — every non-self
            // reactor fell back to the single fixed `otherName`/`otherPhoto` (correct for a 1:1,
            // where there's only ever one other participant), so in a group every reactor besides
            // "You" rendered as the same wrong person. Group threads resolve each uid against the
            // conversation's own denormalized roster instead, same lookup already used for
            // message sender names/avatars elsewhere in this file.
            const isMe = uid === user.uid;
            const name = isMe
              ? "You"
              : isGroupThread
                ? (user && selected?.nicknames?.[user.uid]?.[uid]) ?? selected?.participantNames?.[uid] ?? "Reader"
                : otherName;
            const photo = isMe
              ? profile?.photoURL ?? user.photoURL ?? undefined
              : isGroupThread
                ? selected?.participantPhotos?.[uid]
                : otherPhoto;
            return (
              <div key={uid} className="flex items-center gap-3">
                <Avatar uid={uid} photoURL={photo} displayName={name} size={32} />
                <span className="font-noto text-sm text-text">{name}</span>
              </div>
            );
          })}
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
        <GroupInfoPanel
          open={groupInfoOpen}
          onClose={() => setGroupInfoOpen(false)}
          conversation={selectedGroup}
          participantProfiles={participantProfiles}
          onInsertAllMention={() => {
            insertMention("all");
            setGroupInfoOpen(false);
          }}
        />
      )}

      {/* DM Feature Overhaul (Part F). */}
      {selected && (
        <DMSettingsPanel
          open={dmSettingsOpen}
          onClose={() => setDmSettingsOpen(false)}
          conversation={selected}
          otherUid={isGroupThread ? undefined : otherUid}
          otherName={isGroupThread ? undefined : otherName}
          onDeleteConversation={() => {
            setDmSettingsOpen(false);
            if (selectedId) handleHideConversation(selectedId);
          }}
        />
      )}
    </div>
  );
}
