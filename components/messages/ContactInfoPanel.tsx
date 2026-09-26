"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellOff,
  BookOpen,
  Calendar,
  Clock,
  Lock,
  Palette,
  Pencil,
  Trash2,
  User,
  Users2,
  X,
} from "lucide-react";
import AvatarLightbox from "@/components/ui/AvatarLightbox";
import { PlatinumBadge } from "@/components/ui/Badges";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import BlockButton from "@/components/social/BlockButton";
import FollowButton from "@/components/social/FollowButton";
import FollowListModal from "@/components/social/FollowListModal";
import ReportButton from "@/components/social/ReportButton";
import NowPlayingCard from "@/components/spotify/NowPlayingCard";
import { useAuth } from "@/hooks/useAuth";
import {
  getConversationMedia,
  muteConversation,
  resetNickname,
  setDisappearingMessages,
  setNickname,
  unmuteConversation,
  type DisappearingDuration,
} from "@/lib/dms";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { subscribeToUserStatus, type OnlineStatus } from "@/lib/onlineStatus";
import type { Conversation, DMMessage, UserProfile } from "@/types";
import BubbleStylePicker from "./BubbleStylePicker";
import WallpaperPicker from "./WallpaperPicker";

export interface ContactInfoPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  otherUid: string;
  otherProfile: UserProfile | null;
  onDeleteConversation: () => void;
  onBlocked: () => void;
  onUnblocked: () => void;
}

/** Drag the sheet down past this many pixels and releasing dismisses it; short of that, it snaps
 * back to resting. Mobile bottom-sheet only — the desktop right-side panel never sees this. */
const DISMISS_THRESHOLD_PX = 80;

const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "8 hours", ms: 8 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Forever", ms: null },
];

const DISAPPEARING_OPTIONS: { label: string; ms: DisappearingDuration | 0 }[] = [
  { label: "Off", ms: 0 },
  { label: "1 hour", ms: 3600000 },
  { label: "24 hours", ms: 86400000 },
  { label: "7 days", ms: 604800000 },
];

function statusLabel(status: OnlineStatus | null): string {
  if (!status) return "";
  if (status.isOnline) return "Online";
  if (!status.lastSeen) return "";
  const diffMs = Date.now() - new Date(status.lastSeen).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${Math.round(hours / 24)}d ago`;
}

/**
 * Beta feedback: "Currently groups have a '›' chevron that opens the group info panel. Add the
 * same pattern for direct messages." The 1:1 equivalent of GroupInfoPanel — a profile-like header
 * (avatar/name/badges/online status/Now Playing/Follow), a mini stats row, this conversation's
 * shared media, and every per-chat setting (notifications, disappearing messages, wallpaper,
 * bubble style, nickname) plus the account-level actions (block/report/delete) that used to be
 * scattered across the header and the three-dot menu — all in the one place GroupInfoPanel already
 * modeled for groups.
 */
export default function ContactInfoPanel({
  open,
  onClose,
  conversation,
  otherUid,
  otherProfile,
  onDeleteConversation,
  onBlocked,
  onUnblocked,
}: ContactInfoPanelProps) {
  const { user, profile } = useAuth();
  const isPlatinum = profile?.isPlatinum === true;
  const [status, setStatus] = useState<OnlineStatus | null>(null);
  const [media, setMedia] = useState<DMMessage[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);

  // Beta feedback: "Add swipe-down-to-dismiss gesture to ContactInfoPanel bottom sheet on
  // mobile... onTouchStart saves initial Y, onTouchMove translates the panel, onTouchEnd checks
  // distance and either dismisses or snaps back." Kept as plain state + a CSS transform/transition
  // on an inner wrapper — deliberately NOT on the same element framer-motion's own y-animation
  // already drives (the mount/exit slide below), so the two never fight over the same transform.
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (window.matchMedia("(min-width: 640px)").matches) return; // desktop panel doesn't drag
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only downward — dragging up just holds it at the top, it doesn't stretch past resting.
    setDragY(Math.max(0, delta));
  }
  function handleTouchEnd() {
    if (touchStartY.current === null) return;
    touchStartY.current = null;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD_PX) {
      // The exit animation below (spring, y: "100%") takes it the rest of the way — this only
      // needs to trigger it. Reset immediately so the sheet isn't left mid-drag if it's reopened.
      onClose();
      setDragY(0);
    } else {
      setDragY(0); // the transition (disabled above while `dragging`) is what makes this a snap, not a jump
    }
  }

  const otherName = otherProfile?.displayName ?? "Reader";
  const currentNickname = user ? conversation.nicknames?.[user.uid]?.[otherUid] : undefined;
  const myMute = user ? conversation.mutedBy?.[user.uid] : undefined;
  const isMuted = !!myMute && (myMute.until === "forever" || new Date(myMute.until).getTime() > Date.now());
  const disappearing = conversation.disappearingMessages;

  useEffect(() => {
    if (!open) return;
    return subscribeToUserStatus(otherUid, setStatus);
  }, [open, otherUid]);

  useEffect(() => {
    if (!open) return;
    setMediaLoading(true);
    getConversationMedia(conversation.id)
      .then(setMedia)
      .finally(() => setMediaLoading(false));
  }, [open, conversation.id]);

  async function handleSaveNickname() {
    if (!user) return;
    try {
      await setNickname(conversation.id, user.uid, otherUid, nicknameDraft);
      toast.success("Nickname saved.");
      setEditingNickname(false);
    } catch {
      toast.error("Couldn't save that nickname.");
    }
  }

  async function handleResetNickname() {
    if (!user) return;
    await resetNickname(conversation.id, user.uid, otherUid);
    toast.success("Nickname removed.");
  }

  async function handleMute(ms: number | null) {
    if (!user) return;
    await muteConversation(conversation.id, user.uid, ms);
    setMuteMenuOpen(false);
    toast.success("Conversation muted.");
  }

  async function handleUnmute() {
    if (!user) return;
    await unmuteConversation(conversation.id, user.uid);
    toast.success("Conversation unmuted.");
  }

  async function handleDisappearing(ms: DisappearingDuration | 0) {
    if (ms === 0) {
      await setDisappearingMessages(conversation.id, false, 3600000);
      toast.success("Disappearing messages turned off.");
    } else {
      await setDisappearingMessages(conversation.id, true, ms);
      toast.success("Disappearing messages turned on.");
    }
  }

  function handleDelete() {
    if (!window.confirm(`Delete this conversation with ${otherName}?`)) return;
    onDeleteConversation();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/50"
            onClick={onClose}
          />
          {/* Right slide-in on desktop, bottom sheet up to 90vh on mobile — same backdrop/z-index
              as GroupInfoPanel, different resting shape per breakpoint since a contact card reads
              more naturally as a sheet on a phone than a full-height side panel. */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[131] flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-bg2 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-sm sm:rounded-none"
          >
            {/* Plain (non-motion) wrapper for the swipe-down-to-dismiss drag offset — kept separate
                from the motion.div above so this transform never fights the mount/exit spring's own
                y-animation. Touch handlers live on the handle bar + header; touchmove/touchend keep
                firing here even once the finger moves elsewhere in the sheet. */}
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={{
                transform: dragY ? `translateY(${dragY}px)` : undefined,
                transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-bg4 sm:hidden" />
              <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-bg4 bg-bg2 px-4 py-3">
                <p className="font-syne text-sm font-semibold text-text">Contact info</p>
                <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-text">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
              {/* ---- Header: avatar, name, badges, status, Now Playing, Follow ---- */}
              <div className="flex flex-col items-center gap-2 border-b border-bg4 px-4 py-6 text-center">
                <AvatarLightbox uid={otherUid} photoURL={otherProfile?.photoURL} displayName={otherName} size={96} />
                <p className="font-cinzel text-lg text-gold">{otherName}</p>
                {otherProfile?.handle && <p className="font-noto text-sm text-muted">@{otherProfile.handle}</p>}
                <div className="flex items-center gap-1.5">
                  <VerificationBadge user={otherProfile} size={16} />
                  <PlatinumBadge isPlatinum={otherProfile?.isPlatinum} className="h-4 w-4" />
                </div>
                <p className="flex items-center gap-1.5 font-noto text-xs text-muted">
                  <span className={`h-2 w-2 rounded-full ${status?.isOnline ? "bg-green-500" : "bg-muted2"}`} />
                  {statusLabel(status) || "Offline"}
                </p>
                {otherProfile?.spotifyConnected && otherProfile.showNowPlaying !== false && (
                  <div className="mt-1 w-full max-w-[220px]">
                    <NowPlayingCard uid={otherUid} compact />
                  </div>
                )}
                {user && user.uid !== otherUid && (
                  <div className="mt-2">
                    <FollowButton targetUid={otherUid} />
                  </div>
                )}
              </div>

              {/* ---- Mini profile stats ---- */}
              <div className="grid grid-cols-2 gap-3 border-b border-bg4 px-4 py-4">
                <div className="rounded-xl border border-bg4 bg-bg p-3 text-center">
                  <BookOpen className="mx-auto h-4 w-4 text-gold" />
                  <p className="mt-1 font-cinzel text-base text-text">{(otherProfile?.chaptersRead ?? 0).toLocaleString()}</p>
                  <p className="font-noto text-[11px] text-muted">Chapters Read</p>
                </div>
                <button type="button" onClick={() => setFollowingOpen(true)} className="rounded-xl border border-bg4 bg-bg p-3 text-center hover:border-clay">
                  <Users2 className="mx-auto h-4 w-4 text-gold" />
                  <p className="mt-1 font-cinzel text-base text-text">{(otherProfile?.following?.length ?? 0).toLocaleString()}</p>
                  <p className="font-noto text-[11px] text-muted">Following</p>
                </button>
                <button type="button" onClick={() => setFollowersOpen(true)} className="rounded-xl border border-bg4 bg-bg p-3 text-center hover:border-clay">
                  <Users2 className="mx-auto h-4 w-4 text-gold" />
                  <p className="mt-1 font-cinzel text-base text-text">{(otherProfile?.followers?.length ?? 0).toLocaleString()}</p>
                  <p className="font-noto text-[11px] text-muted">Followers</p>
                </button>
                <div className="rounded-xl border border-bg4 bg-bg p-3 text-center">
                  <Calendar className="mx-auto h-4 w-4 text-gold" />
                  <p className="mt-1 font-cinzel text-sm text-text">
                    {otherProfile?.createdAt ? new Date(otherProfile.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}
                  </p>
                  <p className="font-noto text-[11px] text-muted">Joined</p>
                </div>
              </div>

              {/* ---- Shared media ---- */}
              <div className="border-b border-bg4 px-4 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-syne text-xs font-semibold uppercase tracking-wide text-muted">Shared Media</p>
                  <Link href={`/messages/${conversation.id}/media`} className="font-noto text-[11px] font-semibold text-gold hover:underline">
                    See all media
                  </Link>
                </div>
                {mediaLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
                  </div>
                ) : media.length === 0 ? (
                  <p className="font-noto text-xs text-muted">No shared media yet.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {media.map((m) => (
                      <div key={m.id} className="aspect-square overflow-hidden rounded-lg bg-bg3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          loading="lazy"
                          src={m.mediaType === "video" ? getVideoThumbnail(m.mediaUrl ?? "") : m.mediaUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- Chat settings ---- */}
              <div className="flex flex-col gap-3 border-b border-bg4 px-4 py-4">
                <p className="font-syne text-xs font-semibold uppercase tracking-wide text-muted">Chat Settings</p>

                <div className="relative rounded-xl border border-bg4 bg-bg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-noto text-sm text-text">
                      {isMuted ? <BellOff className="h-4 w-4 text-muted" /> : <Bell className="h-4 w-4 text-muted" />} Notifications
                    </span>
                    {isMuted ? (
                      <button type="button" onClick={handleUnmute} className="font-noto text-xs font-semibold text-clay2">
                        Unmute
                      </button>
                    ) : (
                      <button type="button" onClick={() => setMuteMenuOpen((o) => !o)} className="font-noto text-xs font-semibold text-clay2">
                        Mute
                      </button>
                    )}
                  </div>
                  {muteMenuOpen && (
                    <div className="mt-2 flex flex-col gap-1 rounded-lg border border-bg4 bg-bg2 p-1.5">
                      {MUTE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleMute(opt.ms)}
                          className="rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg3"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-bg4 bg-bg p-3">
                  <div className="mb-2 flex items-center gap-2 font-noto text-sm text-text">
                    <Clock className="h-4 w-4 text-muted" /> Disappearing Messages
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DISAPPEARING_OPTIONS.map((opt) => {
                      const isActive = opt.ms === 0 ? !disappearing?.enabled : disappearing?.enabled && disappearing.duration === opt.ms;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleDisappearing(opt.ms)}
                          className={`rounded-full border px-2.5 py-1 font-noto text-xs font-semibold transition-colors ${
                            isActive ? "border-clay bg-clay text-ivory" : "border-muted2 text-muted hover:text-text"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-bg4 bg-bg p-3">
                  <span className="flex items-center gap-2 font-noto text-sm text-text">
                    <Palette className="h-4 w-4 text-muted" /> Wallpaper
                  </span>
                  <button
                    type="button"
                    onClick={() => setWallpaperOpen(true)}
                    className="flex items-center gap-1.5 rounded-full bg-bg3 px-3 py-1 font-noto text-xs font-semibold text-text"
                  >
                    {isPlatinum ? "Change" : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-bg4 bg-bg p-3">
                  <span className="flex items-center gap-2 font-noto text-sm text-text">
                    <span className={`message-bubble h-5 w-9 rounded-full bg-clay bubble-style-${profile?.dmPreferences?.bubbleStyle ?? 1}`} />
                    Bubble Style
                  </span>
                  <button
                    type="button"
                    onClick={() => setBubbleStyleOpen(true)}
                    className="flex items-center gap-1.5 rounded-full bg-bg3 px-3 py-1 font-noto text-xs font-semibold text-text"
                  >
                    {isPlatinum ? "Change" : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="rounded-xl border border-bg4 bg-bg p-3">
                  <div className="flex items-center gap-2 font-noto text-sm text-text">
                    <User className="h-4 w-4 text-muted" /> Nickname
                  </div>
                  {editingNickname ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        value={nicknameDraft}
                        onChange={(e) => setNicknameDraft(e.target.value.slice(0, 30))}
                        placeholder="e.g. Baby Boo"
                        className="input-base flex-1 text-sm"
                      />
                      <button type="button" onClick={handleSaveNickname} className="btn-primary shrink-0 text-sm">
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="font-noto text-xs text-text">{currentNickname ?? "Not set"}</p>
                      <div className="flex items-center gap-2">
                        {currentNickname && (
                          <button type="button" onClick={handleResetNickname} className="font-noto text-[11px] text-clay2">
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNicknameDraft(currentNickname ?? "");
                            setEditingNickname(true);
                          }}
                          aria-label="Edit nickname"
                          className="text-muted hover:text-text"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {!isPlatinum && (
                  <Link href="/pricing" className="btn-plat w-full justify-center text-sm">
                    Upgrade to Platinum for wallpapers, bubble styles &amp; colors
                  </Link>
                )}
              </div>

              {/* ---- Actions ---- */}
              <div className="flex flex-col gap-2 px-4 py-4">
                <BlockButton targetUid={otherUid} targetLabel={otherName} onBlocked={onBlocked} onUnblocked={onUnblocked} />
                <ReportButton targetType="user" targetId={otherUid} targetUserId={otherUid} label={`Report ${otherName}`} zIndex={140} />
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-2 rounded-lg py-2 font-noto text-sm font-semibold text-clay2 hover:bg-bg3"
                >
                  <Trash2 className="h-4 w-4" /> Delete Conversation
                </button>
              </div>
              </div>
            </div>
          </motion.div>

          <WallpaperPicker open={wallpaperOpen} onClose={() => setWallpaperOpen(false)} conversationId={conversation.id} currentBlur={conversation.wallpaperBlur ?? false} />
          <BubbleStylePicker open={bubbleStyleOpen} onClose={() => setBubbleStyleOpen(false)} conversationId={conversation.id} />
          <FollowListModal open={followersOpen} onClose={() => setFollowersOpen(false)} title="Followers" uid={otherUid} mode="followers" />
          <FollowListModal open={followingOpen} onClose={() => setFollowingOpen(false)} title="Following" uid={otherUid} mode="following" />
        </>
      )}
    </AnimatePresence>
  );
}
