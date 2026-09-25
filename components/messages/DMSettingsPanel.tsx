"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, Clock, Lock, Palette, Trash2, User, X } from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import ReportButton from "@/components/social/ReportButton";
import { useAuth } from "@/hooks/useAuth";
import {
  muteConversation,
  resetNickname,
  setDisappearingMessages,
  setNickname,
  setUserDmPreference,
  unmuteConversation,
  type DisappearingDuration,
} from "@/lib/dms";
import type { Conversation } from "@/types";
import BubbleStylePicker from "./BubbleStylePicker";
import ChatColorPicker from "./ChatColorPicker";
import WallpaperPicker from "./WallpaperPicker";

export interface DMSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  /** Undefined for a group thread — nickname/block only make sense for a 1:1 contact. */
  otherUid?: string;
  otherName?: string;
  onDeleteConversation: () => void;
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

/** DM Feature Overhaul (Part F): slide-in panel from a conversation's options menu — Wallpaper/
 * Bubble Style/Bubble Color previews (each opening their own Platinum-gated picker), Nickname,
 * Mute, Disappearing Messages, and Privacy (delete/block). Every Platinum feature shows its lock
 * state inline rather than hiding the row entirely, so a free account can see what they're
 * missing and where to upgrade. */
export default function DMSettingsPanel({
  open,
  onClose,
  conversation,
  otherUid,
  otherName,
  onDeleteConversation,
}: DMSettingsPanelProps) {
  const { user, profile } = useAuth();
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const [bubbleColorOpen, setBubbleColorOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const isPlatinum = profile?.isPlatinum === true;
  const myMute = user ? conversation.mutedBy?.[user.uid] : undefined;
  const isMuted = !!myMute && (myMute.until === "forever" || new Date(myMute.until).getTime() > Date.now());
  const currentNickname = user && otherUid ? conversation.nicknames?.[user.uid]?.[otherUid] : undefined;
  const disappearing = conversation.disappearingMessages;

  async function handleSaveNickname() {
    if (!user || !otherUid) return;
    try {
      await setNickname(conversation.id, user.uid, otherUid, nicknameDraft);
      toast.success("Nickname saved.");
      setEditingNickname(false);
    } catch {
      toast.error("Couldn't save that nickname.");
    }
  }

  async function handleResetNickname() {
    if (!user || !otherUid) return;
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

  // Beta feedback: "Read receipt privacy setting: In DM Settings → Privacy: 'Send read receipts'
  // toggle... Platinum only." A free account never sees this — they always send receipts when the
  // message they're reading is from a Platinum sender (that sender's paid feature, not their own
  // to withhold); only Platinum accounts get a say in whether THEIRS go out.
  const sendReadReceipts = profile?.dmPreferences?.sendReadReceipts !== false;
  async function handleToggleReadReceipts() {
    if (!user) return;
    const next = !sendReadReceipts;
    useAuth.getState().setProfile(profile ? { ...profile, dmPreferences: { ...profile.dmPreferences, sendReadReceipts: next } } : profile);
    await setUserDmPreference(user.uid, "sendReadReceipts", next).catch(() => {
      toast.error("Couldn't save that.");
    });
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
            <div className="flex shrink-0 items-center justify-between border-b border-bg4 px-4 py-3">
              <p className="font-syne text-sm font-semibold text-text">Chat Settings</p>
              <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-6 p-4">
              {/* Wallpaper */}
              <section>
                <h3 className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Wallpaper</h3>
                <div className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg p-3">
                  <span
                    className="h-10 w-10 shrink-0 rounded-lg bg-bg3"
                    style={
                      conversation.wallpaperUrl
                        ? conversation.wallpaperType === "image"
                          ? { backgroundImage: `url(${conversation.wallpaperUrl})`, backgroundSize: "cover" }
                          : { background: conversation.wallpaperUrl }
                        : undefined
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-noto text-xs text-text">{conversation.wallpaperUrl ? "Custom wallpaper" : "Default"}</p>
                    {conversation.wallpaperSetBy && (
                      <p className="truncate font-noto text-[10px] text-muted">
                        Wallpaper set by {conversation.wallpaperSetBy === user?.uid ? "you" : otherName ?? "a Platinum member"} 💎
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWallpaperOpen(true)}
                    className="shrink-0 rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-text"
                  >
                    {isPlatinum ? "Change" : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </section>

              {/* Bubble style */}
              <section>
                <h3 className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Your Bubble Style</h3>
                <div className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg p-3">
                  <span
                    className={`message-bubble h-8 w-14 shrink-0 bg-clay bubble-style-${profile?.dmPreferences?.bubbleStyle ?? 1}`}
                    style={profile?.dmPreferences?.bubbleColor ? { background: profile.dmPreferences.bubbleColor } : undefined}
                  />
                  <p className="flex-1 font-noto text-xs text-text">Style {profile?.dmPreferences?.bubbleStyle ?? 1}</p>
                  <button
                    type="button"
                    onClick={() => setBubbleStyleOpen(true)}
                    className="shrink-0 rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-text"
                  >
                    {isPlatinum ? "Change" : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </section>

              {/* Bubble color */}
              <section>
                <h3 className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Your Bubble Color</h3>
                <div className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg p-3">
                  <span
                    className="h-8 w-8 shrink-0 rounded-full"
                    style={{ background: profile?.dmPreferences?.bubbleColor ?? "#c4622d" }}
                  />
                  <p className="flex-1 font-noto text-xs text-text">
                    {profile?.dmPreferences?.bubbleColor ?? "Default"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setBubbleColorOpen(true)}
                    className="shrink-0 rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-text"
                  >
                    {isPlatinum ? "Change" : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </section>

              {/* Nickname */}
              {otherUid && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                    <User className="h-3.5 w-3.5" /> Nickname
                  </h3>
                  {editingNickname ? (
                    <div className="flex gap-2">
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
                    <div className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg p-3">
                      <p className="flex-1 font-noto text-xs text-text">{currentNickname ?? "None set"}</p>
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
                        className="shrink-0 rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-text"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Notifications */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  {isMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />} Notifications
                </h3>
                <div className="relative">
                  {isMuted ? (
                    <button type="button" onClick={handleUnmute} className="btn-ghost w-full text-sm">
                      Unmute conversation
                    </button>
                  ) : (
                    <button type="button" onClick={() => setMuteMenuOpen((o) => !o)} className="btn-ghost w-full text-sm">
                      Mute conversation
                    </button>
                  )}
                  {muteMenuOpen && (
                    <div className="mt-2 flex flex-col gap-1 rounded-xl border border-bg4 bg-bg p-1.5">
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
              </section>

              {/* Disappearing messages */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  <Clock className="h-3.5 w-3.5" /> Disappearing Messages
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {DISAPPEARING_OPTIONS.map((opt) => {
                    const isActive = opt.ms === 0 ? !disappearing?.enabled : disappearing?.enabled && disappearing.duration === opt.ms;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handleDisappearing(opt.ms)}
                        className={`rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
                          isActive ? "border-clay bg-clay text-ivory" : "border-muted2 text-muted hover:text-text"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Privacy */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                  <Palette className="h-3.5 w-3.5" /> Privacy
                </h3>
                <div className="flex flex-col gap-2">
                  {isPlatinum && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-bg4 bg-bg p-3">
                      <div>
                        <p className="font-noto text-sm text-text">Send read receipts</p>
                        <p className="font-noto text-xs text-muted">If off, others never see when you&apos;ve read their messages.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={sendReadReceipts}
                        onChange={handleToggleReadReceipts}
                        className="h-4 w-4 shrink-0 accent-clay"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={onDeleteConversation}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left font-noto text-sm text-clay2 hover:bg-bg3"
                  >
                    <Trash2 className="h-4 w-4" /> Delete conversation
                  </button>
                  {otherUid && otherName && (
                    <>
                      <BlockButton targetUid={otherUid} targetLabel={otherName} />
                      {/* Beta feedback: "Where's the report user feature in 1 on 1 dms not
                          groups?" — groups already had Report Group; this was the missing 1:1
                          equivalent. */}
                      <ReportButton targetType="user" targetId={otherUid} targetUserId={otherUid} label={`Report ${otherName}`} zIndex={140} />
                    </>
                  )}
                </div>
              </section>

              {!isPlatinum && (
                <Link href="/pricing" className="btn-plat w-full justify-center text-sm">
                  Upgrade to Platinum for wallpapers, bubble styles &amp; colors
                </Link>
              )}
            </div>
          </motion.div>

          <WallpaperPicker
            open={wallpaperOpen}
            onClose={() => setWallpaperOpen(false)}
            conversationId={conversation.id}
            currentBlur={conversation.wallpaperBlur ?? false}
          />
          <BubbleStylePicker open={bubbleStyleOpen} onClose={() => setBubbleStyleOpen(false)} conversationId={conversation.id} />
          <ChatColorPicker open={bubbleColorOpen} onClose={() => setBubbleColorOpen(false)} conversationId={conversation.id} />
        </>
      )}
    </AnimatePresence>
  );
}
