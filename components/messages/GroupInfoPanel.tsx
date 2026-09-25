"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  BadgeCheck,
  Bell,
  BellOff,
  Camera,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  LogOut,
  MoreHorizontal,
  Palette,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BirthdayBadge } from "@/components/ui/BirthdayBadge";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useAuth } from "@/hooks/useAuth";
import { getVideoThumbnail, uploadImage } from "@/lib/cloudinary";
import {
  addMembersToGroup,
  deleteGroup,
  getConversationMedia,
  leaveGroup,
  makeGroupAdmin,
  MEMBER_TAG_MAX_LENGTH,
  removeGroupAdmin,
  setMemberTag,
  muteConversation,
  regenerateInviteCode,
  removeMemberFromGroup,
  setDisappearingMessages,
  unmuteConversation,
  updateGroupInfo,
  type DisappearingDuration,
} from "@/lib/dms";
import { searchUsers } from "@/lib/firestore";
import { subscribeToUserStatus, type OnlineStatus } from "@/lib/onlineStatus";
import { formatTime, getUserProfileUrl, initials, stringToColor } from "@/lib/utils";
import { formatCallDuration, getGroupCallHistory } from "@/lib/groupCalls";
import {
  applyForGroupVerification,
  getGroupVerificationRequest,
  GROUP_VERIFICATION_MIN_REASON,
  type GroupVerificationRequest,
} from "@/lib/groupVerification";
import type { Conversation, DMMessage, GroupCall, UserProfile } from "@/types";
import WallpaperPicker from "./WallpaperPicker";

export interface GroupInfoPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  /** Verification/birthday badges need more than the conversation doc's own denormalized
   * participantNames/Photos — fetched once by MessagesClient while this panel is open. */
  participantProfiles: Map<string, UserProfile>;
  /** "@all mention shortcut button" — inserts the token into the message composer and closes
   * this panel, handing focus back to the thread. */
  onInsertAllMention: () => void;
}

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

function statusLabel(status: OnlineStatus | undefined): string {
  if (!status) return "";
  if (status.isOnline) return "Online";
  if (!status.lastSeen) return "";
  return `Last seen ${formatTime(status.lastSeen)}`;
}

/**
 * WhatsApp-style Group Info redesign (beta feedback: "Make group infos like whatsapp's or
 * telegrams"). A dedicated slide-in panel (same right-edge-slide shape as DMSettingsPanel, for
 * visual consistency between this app's two settings panels) covering: header (photo/name/
 * member count/creator+date), description, a Media & Files strip, a Settings card (mute,
 * disappearing messages, invite link, wallpaper), a searchable member list with per-member
 * actions, and a Danger Zone. Mostly self-contained — it calls lib/dms.ts's group mutations
 * directly and relies on MessagesClient's own live `subscribeToConversations` listener to reflect
 * every write back into the `conversation` prop, rather than threading each mutation's result
 * back up through callback props.
 */
export default function GroupInfoPanel({
  open,
  onClose,
  conversation,
  participantProfiles,
  onInsertAllMention,
}: GroupInfoPanelProps) {
  const { user, profile } = useAuth();
  const isGroupAdmin = !!user && (conversation.adminUids ?? []).includes(user.uid);
  const isPlatinum = profile?.isPlatinum === true;
  const myMute = user ? conversation.mutedBy?.[user.uid] : undefined;
  const isMuted = !!myMute && (myMute.until === "forever" || new Date(myMute.until).getTime() > Date.now());
  const disappearing = conversation.disappearingMessages;

  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const [media, setMedia] = useState<DMMessage[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [callHistory, setCallHistory] = useState<GroupCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);

  const [memberSearch, setMemberSearch] = useState("");
  const [memberActionUid, setMemberActionUid] = useState<string | null>(null);
  const [tagEditUid, setTagEditUid] = useState<string | null>(null);
  const [verifyRequest, setVerifyRequest] = useState<GroupVerificationRequest | null | undefined>(undefined);
  const [verifyReason, setVerifyReason] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [statusByUid, setStatusByUid] = useState<Record<string, OnlineStatus>>({});

  const [addingMembers, setAddingMembers] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<UserProfile[]>([]);
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());

  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Resets every sub-flow whenever the panel closes, so re-opening it never shows stale state
  // from a previous member/media it was open for.
  useEffect(() => {
    if (open) return;
    setEditingName(false);
    setEditingDescription(false);
    setMemberSearch("");
    setMemberActionUid(null);
    setAddingMembers(false);
    setMuteMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMediaLoading(true);
    getConversationMedia(conversation.id)
      .then(setMedia)
      .finally(() => setMediaLoading(false));
  }, [open, conversation.id]);

  // Group verification: this group's application (if any) — only a group admin can see/file it.
  useEffect(() => {
    if (!open || !isGroupAdmin || conversation.verifiedGroup) return;
    setVerifyRequest(undefined);
    getGroupVerificationRequest(conversation.id).then(setVerifyRequest);
  }, [open, isGroupAdmin, conversation.id, conversation.verifiedGroup]);

  async function handleApplyVerification() {
    if (!user) return;
    setVerifyBusy(true);
    try {
      const req = await applyForGroupVerification(
        conversation,
        { uid: user.uid, displayName: profile?.displayName ?? user.displayName ?? "Admin" },
        verifyReason
      );
      setVerifyRequest(req);
      setVerifyFormOpen(false);
      setVerifyReason("");
      toast.success("Application sent — an ÍléOtaku admin will review it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send your application.");
    } finally {
      setVerifyBusy(false);
    }
  }

  // Group voice calls: the last few finished calls. Loaded when the panel opens (a call that ends
  // while it's open shows up the next time it is).
  useEffect(() => {
    if (!open || !user) return;
    setCallsLoading(true);
    getGroupCallHistory(conversation.id, user.uid, 5)
      .then(setCallHistory)
      .catch(() => setCallHistory([]))
      .finally(() => setCallsLoading(false));
  }, [open, conversation.id, user]);

  useEffect(() => {
    if (!open) return;
    const unsubs = conversation.participants.map((uid) =>
      subscribeToUserStatus(uid, (status) => setStatusByUid((prev) => ({ ...prev, [uid]: status })))
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversation.id]);

  useEffect(() => {
    const q = addQuery.trim();
    if (!q) {
      setAddResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchUsers(q).then((res) => setAddResults(res.filter((u) => !conversation.participants.includes(u.uid))));
    }, 300);
    return () => clearTimeout(handle);
  }, [addQuery, conversation.participants]);

  function inviteLinkFor(code: string): string {
    return typeof window !== "undefined" ? `${window.location.origin}/invite/${code}` : `/invite/${code}`;
  }

  async function handleChangePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setBusy(true);
    try {
      const uploaded = await uploadImage(file, `group-photos/${user.uid}`);
      await updateGroupInfo(conversation.id, user.uid, { photoURL: uploaded.secureUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the group photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName() {
    if (!user || !nameDraft.trim()) return;
    setBusy(true);
    try {
      await updateGroupInfo(conversation.id, user.uid, { name: nameDraft.trim() });
      setEditingName(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename the group.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDescription() {
    if (!user) return;
    setBusy(true);
    try {
      await updateGroupInfo(conversation.id, user.uid, { description: descriptionDraft.trim().slice(0, 500) });
      setEditingDescription(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the description.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAddSelected(uid: string) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleAddMembers() {
    if (!user || addSelected.size === 0) return;
    setBusy(true);
    try {
      await addMembersToGroup(conversation.id, user.uid, Array.from(addSelected));
      toast.success("Members added.");
      setAddingMembers(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add those members.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(targetUid: string) {
    if (!user) return;
    setMemberActionUid(null);
    try {
      await removeMemberFromGroup(conversation.id, user.uid, targetUid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that member.");
    }
  }

  async function handleMakeAdmin(targetUid: string) {
    if (!user) return;
    setMemberActionUid(null);
    try {
      await makeGroupAdmin(conversation.id, user.uid, targetUid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't promote that member.");
    }
  }

  async function handleRemoveAdmin(targetUid: string) {
    if (!user) return;
    setMemberActionUid(null);
    try {
      await removeGroupAdmin(conversation.id, user.uid, targetUid);
      toast.success("Admin rights removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that admin.");
    }
  }

  async function handleSaveTag(targetUid: string, tag: string) {
    if (!user) return;
    try {
      await setMemberTag(conversation.id, user.uid, targetUid, tag);
      setTagEditUid(null);
      toast.success(tag.trim() ? "Tag saved." : "Tag removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that tag.");
    }
  }

  async function handleMute(ms: number | null) {
    if (!user) return;
    await muteConversation(conversation.id, user.uid, ms);
    setMuteMenuOpen(false);
    toast.success("Group muted.");
  }

  async function handleUnmute() {
    if (!user) return;
    await unmuteConversation(conversation.id, user.uid);
    toast.success("Group unmuted.");
  }

  async function handleDisappearing(ms: DisappearingDuration | 0) {
    if (ms === 0) await setDisappearingMessages(conversation.id, false, 3600000);
    else await setDisappearingMessages(conversation.id, true, ms);
  }

  async function handleCopyInviteLink() {
    if (!conversation.inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteLinkFor(conversation.inviteCode));
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  async function handleResetInviteLink() {
    if (!user || inviteBusy) return;
    setInviteBusy(true);
    try {
      await regenerateInviteCode(conversation.id, user.uid);
      toast.success("Invite link reset.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reset the invite link.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleLeave() {
    if (!user) return;
    try {
      await leaveGroup(conversation.id, user.uid);
      onClose();
    } catch {
      toast.error("Couldn't leave the group.");
    }
  }

  async function handleDelete() {
    if (!user) return;
    if (!window.confirm(`Delete "${conversation.name ?? "this group"}"? This can't be undone.`)) return;
    try {
      await deleteGroup(conversation.id, user.uid);
      onClose();
    } catch {
      toast.error("Couldn't delete the group.");
    }
  }

  const filteredMembers = conversation.participants.filter((uid) => {
    if (!memberSearch.trim()) return true;
    const name = conversation.participantNames?.[uid] ?? "";
    return name.toLowerCase().includes(memberSearch.trim().toLowerCase());
  });

  const createdLabel = conversation.createdAt
    ? new Date(conversation.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;
  const creatorName = conversation.creatorUid ? conversation.participantNames?.[conversation.creatorUid] : null;

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
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-[131] flex w-full max-w-sm flex-col overflow-y-auto bg-bg2 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-bg4 bg-bg2 px-4 py-3">
              <p className="font-syne text-sm font-semibold text-text">
                {addingMembers ? "Add members" : "Group info"}
              </p>
              <button
                type="button"
                onClick={() => (addingMembers ? setAddingMembers(false) : onClose())}
                aria-label="Close"
                className="text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addingMembers ? (
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    autoFocus
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Search people..."
                    className="input-base w-full pl-9"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                  {addResults.map((u) => {
                    const picked = addSelected.has(u.uid);
                    return (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => toggleAddSelected(u.uid)}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-bg3"
                      >
                        <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={36} />
                        <span className="min-w-0 flex-1 truncate font-syne text-sm font-semibold text-text">{u.displayName}</span>
                        {picked && <Check className="h-4 w-4 shrink-0 text-clay" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={addSelected.size === 0 || busy}
                  className="btn-primary w-full justify-center"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${addSelected.size || ""}`.trim()}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-6 p-4">
                {/* ---- Header ---- */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <button
                    type="button"
                    onClick={() => isGroupAdmin && photoInputRef.current?.click()}
                    disabled={!isGroupAdmin || busy}
                    className="relative"
                    aria-label={isGroupAdmin ? "Change group photo" : "Group photo"}
                  >
                    {conversation.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" src={conversation.photoURL} alt="" className="h-[120px] w-[120px] rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-[120px] w-[120px] items-center justify-center rounded-full font-cinzel text-3xl font-bold text-white"
                        style={{ background: stringToColor(conversation.name ?? "Group") }}
                      >
                        {initials(conversation.name ?? "Group")}
                      </div>
                    )}
                    {isGroupAdmin && (
                      <span className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg2 bg-clay text-ivory">
                        <Camera className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handleChangePhoto} className="hidden" />

                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                        className="input-base text-center"
                      />
                      <button type="button" onClick={handleSaveName} disabled={busy} aria-label="Save name">
                        <Check className="h-4 w-4 text-gold" />
                      </button>
                      <button type="button" onClick={() => setEditingName(false)} aria-label="Cancel">
                        <X className="h-4 w-4 text-muted" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isGroupAdmin) return;
                        setNameDraft(conversation.name ?? "");
                        setEditingName(true);
                      }}
                      className="flex items-center gap-1.5 font-cinzel text-lg text-text"
                    >
                      {conversation.name}
                      {conversation.verifiedGroup && <BadgeCheck data-testid="group-verified-badge" aria-label="Verified group" className="h-4 w-4 text-plat" />}
                      {isGroupAdmin && <Pencil className="h-3.5 w-3.5 text-muted" />}
                    </button>
                  )}
                  <p className="font-noto text-xs text-muted">{conversation.participants.length} members</p>
                  {creatorName && createdLabel && (
                    <p className="font-noto text-[11px] text-muted">
                      Created by {creatorName} on {createdLabel}
                    </p>
                  )}
                </div>

                {/* ---- Description ---- */}
                <div>
                  <p className="mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Description</p>
                  {editingDescription ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        autoFocus
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value.slice(0, 500))}
                        maxLength={500}
                        rows={3}
                        className="input-base resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-noto text-[10px] text-muted">{descriptionDraft.length}/500</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditingDescription(false)} className="btn-ghost px-3 py-1 text-xs">
                            Cancel
                          </button>
                          <button type="button" onClick={handleSaveDescription} disabled={busy} className="btn-primary px-3 py-1 text-xs">
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isGroupAdmin) return;
                        setDescriptionDraft(conversation.description ?? "");
                        setEditingDescription(true);
                      }}
                      className="w-full rounded-xl border border-bg4 bg-bg p-3 text-left font-noto text-xs text-muted hover:border-clay/40"
                      disabled={!isGroupAdmin && !conversation.description}
                    >
                      {conversation.description || (isGroupAdmin ? "Add group description" : "No description yet.")}
                    </button>
                  )}
                </div>

                {/* ---- Group verification ---- */}
                {(isGroupAdmin || conversation.verifiedGroup) && (
                  <div data-testid="group-verification">
                    <p className="mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Verification</p>
                    {conversation.verifiedGroup ? (
                      <p className="flex items-center gap-1.5 font-noto text-xs text-text">
                        <BadgeCheck className="h-4 w-4 text-plat" /> This group is verified.
                      </p>
                    ) : verifyRequest === undefined ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted" />
                    ) : verifyRequest?.status === "pending" ? (
                      <p className="font-noto text-xs text-muted" data-testid="group-verification-pending">
                        Application sent — waiting for an admin to review it.
                      </p>
                    ) : verifyFormOpen || !verifyRequest || verifyRequest.status === "rejected" ? (
                      <div className="flex flex-col gap-2">
                        {verifyRequest?.status === "rejected" && (
                          <p className="rounded-lg border border-dashed border-clay2/40 bg-clay2/5 p-2 font-noto text-[11px] text-clay2">
                            Not verified last time{verifyRequest.rejectionReason ? ` — ${verifyRequest.rejectionReason}` : ""}. You can apply again.
                          </p>
                        )}
                        {verifyFormOpen || verifyRequest?.status === "rejected" ? (
                          <>
                            <textarea
                              value={verifyReason}
                              onChange={(e) => setVerifyReason(e.target.value)}
                              rows={3}
                              placeholder="What is this group, and why should it be verified?"
                              data-testid="group-verification-reason"
                              className="input-base w-full resize-none text-xs"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-noto text-[11px] text-muted">
                                {verifyReason.trim().length}/{GROUP_VERIFICATION_MIN_REASON} characters minimum
                              </span>
                              <button
                                type="button"
                                onClick={handleApplyVerification}
                                disabled={verifyBusy || verifyReason.trim().length < GROUP_VERIFICATION_MIN_REASON}
                                data-testid="group-verification-submit"
                                className="btn-primary text-xs disabled:opacity-40"
                              >
                                {verifyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <button type="button" onClick={() => setVerifyFormOpen(true)} data-testid="group-verification-apply" className="btn-ghost inline-flex w-fit items-center gap-1.5 text-xs">
                            <BadgeCheck className="h-3.5 w-3.5" /> Apply for verification
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* ---- Call history (group voice calls) ---- */}
                <div data-testid="call-history">
                  <p className="mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Call history</p>
                  {callsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted" />
                    </div>
                  ) : callHistory.length === 0 ? (
                    <p className="font-noto text-xs text-muted">No calls yet</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {callHistory.map((c) => {
                        const answered = !!c.activeAt;
                        // You first, then in the order people joined (the caller is always first to join).
                        const who = Object.values(c.participants)
                          .filter((p) => p.joinedAt)
                          .sort((x, y) => (x.uid === user?.uid ? -1 : y.uid === user?.uid ? 1 : (x.joinedAt ?? "").localeCompare(y.joinedAt ?? "")));
                        return (
                          <li key={c.callId} data-testid="call-history-item" className="rounded-xl border border-bg4 bg-bg px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-noto text-xs font-semibold text-text">
                                {new Date(c.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                {" · "}
                                {new Date(c.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                              </span>
                              <span className={`font-noto text-xs ${answered ? "text-muted" : "text-clay2"}`}>
                                {answered ? formatCallDuration(c.duration ?? 0) : "Missed"}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate font-noto text-[11px] text-muted">
                              {who.map((p) => (p.uid === user?.uid ? "You" : p.displayName)).join(", ")}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* ---- Media & Files ---- */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="font-syne text-xs font-semibold uppercase tracking-wide text-muted">Media &amp; Files</p>
                    <Link
                      href={`/messages/${conversation.id}/media`}
                      className="font-noto text-[11px] font-semibold text-gold hover:underline"
                    >
                      See all media
                    </Link>
                  </div>
                  {mediaLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted" />
                    </div>
                  ) : media.length === 0 ? (
                    <p className="font-noto text-xs text-muted">No shared media yet.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {media.map((m) => (
                        <div key={m.id} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-bg3">
                          {/* Beta feedback bug: "media preview in group chat media tab ... showing
                              broken images" — a video message's mediaUrl is the raw .mp4, which
                              renders as a broken <img>; getVideoThumbnail derives its poster frame. */}
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

                {/* ---- Settings ---- */}
                <div>
                  <p className="mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Settings</p>
                  <div className="flex flex-col gap-1 rounded-xl border border-bg4 bg-bg">
                    <div className="relative border-b border-bg4 p-3">
                      {isMuted ? (
                        <button type="button" onClick={handleUnmute} className="flex w-full items-center gap-2 font-noto text-sm text-text">
                          <BellOff className="h-4 w-4 text-muted" /> Notifications — Muted
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMuteMenuOpen((o) => !o)}
                          className="flex w-full items-center gap-2 font-noto text-sm text-text"
                        >
                          <Bell className="h-4 w-4 text-muted" /> Notifications — On
                        </button>
                      )}
                      {muteMenuOpen && (
                        <div className="mt-2 flex flex-col gap-1 rounded-xl border border-bg4 bg-bg2 p-1.5">
                          {MUTE_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => handleMute(opt.ms)}
                              className="rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg3"
                            >
                              Mute for {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-b border-bg4 p-3">
                      <p className="mb-1.5 flex items-center gap-2 font-noto text-sm text-text">
                        <Clock className="h-4 w-4 text-muted" /> Disappearing Messages
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {DISAPPEARING_OPTIONS.map((opt) => {
                          const isActive = opt.ms === 0 ? !disappearing?.enabled : disappearing?.enabled && disappearing.duration === opt.ms;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => handleDisappearing(opt.ms)}
                              className={`rounded-full border px-3 py-1 font-noto text-xs font-semibold transition-colors ${
                                isActive ? "border-clay bg-clay text-ivory" : "border-muted2 text-muted hover:text-text"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-b border-bg4 p-3">
                      <p className="mb-1.5 flex items-center gap-2 font-noto text-sm text-text">
                        <Link2 className="h-4 w-4 text-muted" /> Invite Link
                      </p>
                      {conversation.inviteCode ? (
                        <div className="flex items-center gap-2 rounded-lg bg-bg2 p-2">
                          <p className="min-w-0 flex-1 truncate font-noto text-[11px] text-muted">
                            {inviteLinkFor(conversation.inviteCode)}
                          </p>
                          <button type="button" onClick={handleCopyInviteLink} aria-label="Copy invite link" className="shrink-0 text-muted hover:text-text">
                            {inviteCopied ? <Check className="h-3.5 w-3.5 text-green2" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {isGroupAdmin && (
                            <button type="button" onClick={handleResetInviteLink} disabled={inviteBusy} aria-label="Reset invite link" className="shrink-0 text-muted hover:text-text">
                              <RefreshCw className={`h-3.5 w-3.5 ${inviteBusy ? "animate-spin" : ""}`} />
                            </button>
                          )}
                        </div>
                      ) : (
                        isGroupAdmin && (
                          <button type="button" onClick={handleResetInviteLink} disabled={inviteBusy} className="font-noto text-xs font-semibold text-gold hover:underline">
                            {inviteBusy ? "Creating..." : "Create invite link"}
                          </button>
                        )
                      )}
                    </div>

                    <div className="p-3">
                      <button type="button" onClick={() => setWallpaperOpen(true)} className="flex w-full items-center gap-3">
                        <span
                          className="h-8 w-8 shrink-0 rounded-lg bg-bg3"
                          style={
                            conversation.wallpaperUrl
                              ? conversation.wallpaperType === "image"
                                ? { backgroundImage: `url(${conversation.wallpaperUrl})`, backgroundSize: "cover" }
                                : { background: conversation.wallpaperUrl }
                              : undefined
                          }
                        />
                        <span className="flex-1 text-left font-noto text-sm text-text">
                          <Palette className="mr-1.5 inline h-3.5 w-3.5 text-muted" /> Wallpaper
                        </span>
                        <span className="font-noto text-xs font-semibold text-gold">{isPlatinum ? "Change" : "Platinum"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ---- Members ---- */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                      Members ({conversation.participants.length})
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={onInsertAllMention}
                        className="flex items-center gap-1 font-noto text-xs font-semibold text-gold hover:underline"
                      >
                        <AtSign className="h-3.5 w-3.5" /> all
                      </button>
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
                  </div>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members..."
                      className="input-base w-full py-1.5 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {filteredMembers.map((uid) => {
                      const name = conversation.participantNames?.[uid] ?? "Reader";
                      const photo = conversation.participantPhotos?.[uid];
                      const isMemberAdmin = (conversation.adminUids ?? []).includes(uid);
                      const isFounder = conversation.creatorUid === uid;
                      const memberProfile = participantProfiles.get(uid);
                      return (
                        <div key={uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1.5">
                          <div className="relative shrink-0">
                            <Avatar uid={uid} photoURL={photo} displayName={name} size={36} />
                            {statusByUid[uid]?.isOnline && (
                              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg2 bg-gold" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 truncate font-noto text-sm text-text">
                              <span className="truncate">{uid === user?.uid ? "You" : name}</span>
                              <VerificationBadge user={memberProfile} size={13} />
                              <BirthdayBadge birthday={memberProfile?.birthday} size={13} />
                              {conversation.memberTags?.[uid] && (
                                <span data-testid="member-tag" className="shrink-0 rounded-full bg-gold/15 px-1.5 py-0.5 font-syne text-[9px] font-semibold uppercase tracking-wide text-gold2">
                                  {conversation.memberTags[uid]}
                                </span>
                              )}
                            </span>
                            <p className="truncate font-noto text-[11px] text-muted">
                              {isFounder ? "Founder" : isMemberAdmin ? "Admin" : statusLabel(statusByUid[uid])}
                            </p>
                            {tagEditUid === uid && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={tagDraft}
                                  maxLength={MEMBER_TAG_MAX_LENGTH}
                                  onChange={(e) => setTagDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleSaveTag(uid, tagDraft);
                                    if (e.key === "Escape") setTagEditUid(null);
                                  }}
                                  placeholder="e.g. Moderator"
                                  aria-label="Member tag"
                                  data-testid="member-tag-input"
                                  className="input-base min-w-0 flex-1 py-1 text-xs"
                                />
                                <button type="button" onClick={() => handleSaveTag(uid, tagDraft)} data-testid="member-tag-save" className="text-xs font-semibold text-gold hover:underline">
                                  Save
                                </button>
                                {conversation.memberTags?.[uid] && (
                                  <button type="button" onClick={() => handleSaveTag(uid, "")} className="text-xs text-muted hover:text-clay2">
                                    Clear
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {(uid !== user?.uid || isGroupAdmin) && (
                            <div className="relative shrink-0">
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
                                    {uid !== user?.uid && (
                                    <Link
                                      href={getUserProfileUrl({ uid, isCreator: memberProfile?.isCreator, handle: memberProfile?.handle })}
                                      onClick={() => setMemberActionUid(null)}
                                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-text hover:bg-bg4"
                                    >
                                      <Users className="h-3.5 w-3.5" /> View Profile
                                    </Link>
                                    )}
                                    {isGroupAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setMemberActionUid(null);
                                          setTagDraft(conversation.memberTags?.[uid] ?? "");
                                          setTagEditUid(uid);
                                        }}
                                        data-testid="member-set-tag"
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-text hover:bg-bg4"
                                      >
                                        <Pencil className="h-3.5 w-3.5" /> {conversation.memberTags?.[uid] ? "Edit Tag" : "Set Tag"}
                                      </button>
                                    )}
                                    {/* Beta feedback: "group founder can't de-admin other admins" — only the founder gets this. */}
                                    {conversation.creatorUid === user?.uid && isMemberAdmin && !isFounder && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAdmin(uid)}
                                        data-testid="member-remove-admin"
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-text hover:bg-bg4"
                                      >
                                        <Shield className="h-3.5 w-3.5" /> Remove Admin
                                      </button>
                                    )}
                                    {isGroupAdmin && !isMemberAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleMakeAdmin(uid)}
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-text hover:bg-bg4"
                                      >
                                        <Shield className="h-3.5 w-3.5" /> Make Admin
                                      </button>
                                    )}
                                    {isGroupAdmin && !isFounder && uid !== user?.uid && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMember(uid)}
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-clay2 hover:bg-bg4"
                                      >
                                        <X className="h-3.5 w-3.5" /> Remove from Group
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---- Danger Zone ---- */}
                <div className="flex flex-col gap-2 border-t border-bg4 pt-3">
                  {conversation.creatorUid === user?.uid ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex items-center justify-center gap-2 rounded-lg py-2 font-noto text-sm font-semibold text-clay2 hover:bg-bg3"
                    >
                      <Trash2 className="h-4 w-4" /> Delete Group
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLeave}
                      className="flex items-center justify-center gap-2 rounded-lg py-2 font-noto text-sm font-semibold text-clay2 hover:bg-bg3"
                    >
                      <LogOut className="h-4 w-4" /> Leave Group
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>

          <WallpaperPicker
            open={wallpaperOpen}
            onClose={() => setWallpaperOpen(false)}
            conversationId={conversation.id}
            currentBlur={conversation.wallpaperBlur ?? false}
          />
        </>
      )}
    </AnimatePresence>
  );
}
