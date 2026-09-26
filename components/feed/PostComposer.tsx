"use client";

import { warmImageTier } from "@/lib/mediaQuality";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import {
  Crown,
  FileEdit,
  Hash,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Music,
  Plus,
  Smile,
  Sparkles,
  Trophy,
  Video,
  X,
} from "lucide-react";
import DraftsModal from "./DraftsModal";
import EditingAppBadge from "./EditingAppBadge";
import ResolutionPicker from "./ResolutionPicker";
import SoundPicker from "./SoundPicker";
import VideoUploader from "./VideoUploader";
import { isSuspended, suspensionMessage } from "@/lib/suspension";
import {
  chargeForResolution,
  createPost,
  deleteDraft,
  getDrafts,
  getForYouEligibility,
  saveDraft,
  type CreatePostInput,
  type UploadedVideo,
} from "@/lib/creatorFeed";
import { uploadImage } from "@/lib/cloudinary";
import { useAuth } from "@/hooks/useAuth";
import type { CreatorPost, CreatorPostType, EditingApp, Sound } from "@/types";

// The full emoji set (search, categories, skin tones) — loaded only when someone opens it.
const EmojiPicker = dynamic(() => import("@/components/ui/EmojiPicker"), { ssr: false });

const MAX_CHARS = 500;
const MAX_IMAGES = 4;

const POST_TYPES: { value: CreatorPostType; label: string; icon: typeof Sparkles }[] = [
  { value: "update", label: "Update", icon: Sparkles },
  { value: "preview", label: "Chapter Preview", icon: ImageIcon },
  { value: "announcement", label: "Announcement", icon: Megaphone },
  { value: "milestone", label: "Milestone", icon: Trophy },
];

const EDITING_APP_OPTIONS: { value: EditingApp | ""; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "capcut", label: "CapCut" },
  { value: "alightmotion", label: "Alight Motion" },
  { value: "aftereffects", label: "After Effects" },
  { value: "premiere", label: "Premiere Pro" },
  { value: "other", label: "Other" },
];

type MediaKind = "none" | "photo" | "video";

interface LocalImage {
  file?: File;
  preview: string;
  /** Set when this image already lives in Cloudinary (kept from a resumed draft) — skips re-upload. */
  url?: string;
}

export interface PostComposerProps {
  onPosted?: () => void;
  /** Controlled mode — the caller owns its own trigger button(s) and open state (FeedClient.tsx's
   * "Create" buttons; the TikTok-style vertical feed already has its own floating "+", positioned
   * to clear each video's like/comment/share rail — a SEPARATE floating trigger of this component's
   * own would collide with it). Omit both for uncontrolled/inline use (ProfilePostsTab,
   * CreatorFeedTab): a plain "Share an update..." bar manages its own open state instead. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * TikTok-style create flow: a floating "+" opens a full-screen sheet on mobile (a centered
 * max-w-lg card on desktop — same tree, just a different resting size/position for the panel),
 * with a fixed bottom toolbar (photo/video/sound/hashtag/emoji), a post-type chip row, a drafts
 * button with a live count badge, and a character counter that turns red past 450/500. Beta
 * feedback: "The feed create modal is ass... redesign the UI make it like tiktok's."
 *
 * Everything below the presentation layer — posting, drafts, resolution charges, badges — is
 * unchanged from before this redesign.
 */
export default function PostComposer({ onPosted, open, onOpenChange }: PostComposerProps) {
  const { user, profile } = useAuth();
  const controlled = open !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlled ? open : internalExpanded;
  function setExpanded(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    if (!controlled) setInternalExpanded(next);
  }
  const [content, setContent] = useState("");
  const [type, setType] = useState<CreatorPostType>("update");
  const [mediaKind, setMediaKind] = useState<MediaKind>("none");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [imageResolution, setImageResolution] = useState<CreatorPost["imageResolution"]>("standard");
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [videoResolution, setVideoResolution] = useState<CreatorPost["videoResolution"]>("480p");
  const [editingApp, setEditingApp] = useState<EditingApp | "">("");
  const [sound, setSound] = useState<Sound | null>(null);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [posting, setPosting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function refreshDraftCount() {
    if (user) getDrafts(user.uid).then((d) => setDraftCount(d.length)).catch(() => {});
  }

  useEffect(() => {
    if (expanded) refreshDraftCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Beta feedback: "everyone can post on feed" — reach is decided by lib/feedAlgorithm.ts, not by a role gate.
  const canPost = profile?.isBanned !== true;
  if (!user || !profile || !canPost) return null;

  const displayName = profile.displayName ?? user.displayName ?? "Creator";
  const isPlatinum = profile.isPlatinum === true;
  const forYouEligible = getForYouEligibility(profile);

  function resetComposer() {
    setContent("");
    setType("update");
    setMediaKind("none");
    images.forEach((img) => {
      if (!img.url) URL.revokeObjectURL(img.preview);
    });
    setImages([]);
    setImageResolution("standard");
    setVideo(null);
    setVideoResolution("480p");
    setEditingApp("");
    setSound(null);
    setDraftId(null);
    setEmojiOpen(false);
    setExpanded(false);
  }

  function insertAtCursor(snippet: string) {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => (c + snippet).slice(0, MAX_CHARS));
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = (content.slice(0, start) + snippet + content.slice(end)).slice(0, MAX_CHARS);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images.`);
      e.target.value = "";
      return;
    }
    const next = files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const img = prev[index];
      if (!img.url) URL.revokeObjectURL(img.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handlePhotoTap() {
    setMediaKind("photo");
    if (images.length < MAX_IMAGES) fileInputRef.current?.click();
  }

  /** Uploads any not-yet-uploaded local images and returns the full attachment URL list (kept +
   * newly uploaded, in their current order) — shared by both Save Draft and Post so a draft
   * never loses an image just because it wasn't published yet. */
  async function uploadPendingImages(): Promise<string[]> {
    return Promise.all(
      images.map(async (img) => {
        if (img.url) return img.url;
        const { secureUrl } = await uploadImage(img.file!, `feed/images/${user!.uid}`);
        return secureUrl;
      })
    );
  }

  function buildBadges() {
    return {
      isVerified: profile!.isVerified,
      isPlatinum: profile!.isPlatinum,
      isFoundingCreator: profile!.foundingCreator,
      isPublisher: profile!.isPublisher,
      isFounder: profile!.isFounder,
      verifiedType: profile!.verifiedType,
      isAdmin: profile!.isAdmin,
      disableDownloads: profile!.disableDownloads,
      birthday: profile!.birthday,
    };
  }

  async function handlePost() {
    if (!user || !profile) return;
    if (isSuspended(profile)) {
      toast.error(suspensionMessage(profile));
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Write something before posting.");
      return;
    }
    setPosting(true);
    try {
      const attachments = mediaKind === "photo" ? await uploadPendingImages() : [];

      if (mediaKind === "photo" && imageResolution && imageResolution !== "standard") {
        const charge = await chargeForResolution(user.uid, "image", imageResolution, isPlatinum);
        if (!charge.success) {
          toast.error(charge.message ?? "Couldn't charge coins for this resolution.");
          setPosting(false);
          return;
        }
      }
      if (mediaKind === "video" && videoResolution && videoResolution !== "480p") {
        const charge = await chargeForResolution(user.uid, "video", videoResolution, isPlatinum);
        if (!charge.success) {
          toast.error(charge.message ?? "Couldn't charge coins for this resolution.");
          setPosting(false);
          return;
        }
      }

      const input: CreatePostInput = {
        uid: user.uid,
        displayName,
        photoURL: profile.photoURL,
        content: trimmed,
        type,
        badges: buildBadges(),
        handle: profile.handle,
        sound,
        attachments,
        imageResolution: mediaKind === "photo" ? imageResolution : undefined,
        videoUrl: mediaKind === "video" ? video?.url : undefined,
        videoPosterUrl: mediaKind === "video" ? video?.posterUrl : undefined,
        videoDuration: mediaKind === "video" ? video?.duration : undefined,
        videoResolution: mediaKind === "video" ? videoResolution : undefined,
        videoPublicId: mediaKind === "video" ? video?.publicId : undefined,
        editingApp: mediaKind === "video" ? (editingApp || null) : undefined,
        forYouEligible,
      };
      // Have Cloudinary build the AI-enhanced / resized versions now so the post is ready when it's first seen.
      if (mediaKind === "photo") attachments.forEach((u) => warmImageTier(u, imageResolution));

      if (mediaKind === "video" && !video?.url) {
        toast.error("Wait for the video to finish uploading first.");
        setPosting(false);
        return;
      }

      await createPost(input);
      if (draftId) await deleteDraft(user.uid, draftId);
      toast.success("Posted! 🔥");
      resetComposer();
      onPosted?.();
    } catch (error) {
      // Surfaces the actual failure (e.g. Firestore's "Missing or insufficient permissions")
      // instead of a generic message — this exact spot was reported hard to diagnose for a
      // non-admin account with no detail to go on.
      toast.error(error instanceof Error ? error.message : "Couldn't publish your post. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveDraft() {
    if (!user || !profile) return;
    if (!content.trim() && mediaKind === "none") {
      toast.error("Write something or attach media before saving a draft.");
      return;
    }
    setSavingDraft(true);
    try {
      const attachments = mediaKind === "photo" ? await uploadPendingImages() : [];
      const newId = await saveDraft(user.uid, {
        draftId: draftId ?? undefined,
        uid: user.uid,
        displayName,
        photoURL: profile.photoURL,
        content: content.trim(),
        type,
        badges: buildBadges(),
        handle: profile.handle,
        sound,
        attachments,
        imageResolution: mediaKind === "photo" ? imageResolution : undefined,
        videoUrl: mediaKind === "video" ? video?.url : undefined,
        videoPosterUrl: mediaKind === "video" ? video?.posterUrl : undefined,
        videoDuration: mediaKind === "video" ? video?.duration : undefined,
        videoResolution: mediaKind === "video" ? videoResolution : undefined,
        videoPublicId: mediaKind === "video" ? video?.publicId : undefined,
        editingApp: mediaKind === "video" ? (editingApp || null) : undefined,
        forYouEligible,
      });
      setDraftId(newId);
      toast.success("Draft saved.");
      refreshDraftCount();
    } catch {
      toast.error("Couldn't save this draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  function handleResumeDraft(draft: CreatorPost) {
    setDraftId(draft.id);
    setContent(draft.content ?? "");
    setType(draft.type ?? "update");
    setImages((draft.attachments ?? []).map((url) => ({ preview: url, url })));
    setImageResolution(draft.imageResolution ?? "standard");
    setEditingApp(draft.editingApp ?? "");
    setVideoResolution(draft.videoResolution ?? "480p");
    setVideo(
      draft.videoUrl
        ? { url: draft.videoUrl, posterUrl: draft.videoPosterUrl ?? "", duration: draft.videoDuration ?? 0, publicId: draft.videoPublicId ?? "" }
        : null
    );
    setMediaKind(draft.mediaType === "video" ? "video" : draft.mediaType === "image" || draft.mediaType === "images" ? "photo" : "none");
    // Reconstructed from the draft's own denormalized soundXxx fields, not a fresh lookup — good
    // enough to publish with (createPost only ever reads id/title/url/source/duration off this),
    // even though a couple of fields here are best-effort filler rather than the real Sound doc.
    setSound(
      draft.soundId
        ? ({
            id: draft.soundId,
            title: draft.soundTitle ?? "",
            titleLower: (draft.soundTitle ?? "").toLowerCase(),
            url: draft.soundUrl ?? "",
            duration: draft.soundDuration ?? null,
            source: draft.soundSource ?? "direct_upload",
            usageCount: 0,
            uploadedBy: draft.uid,
            uploaderName: draft.displayName,
            uploaderHandle: draft.handle ?? draft.uid,
            isPublic: true,
            createdAt: draft.createdAt,
          } as Sound)
        : null
    );
    setDraftsOpen(false);
    setExpanded(true);
  }

  const charsUsed = content.length;
  const suspended = isSuspended(profile);

  return (
    <>
      {/* Uncontrolled/inline use (Profile's Posts tab, the creator dashboard's Feed tab) gets a
          plain trigger bar — the TikTok-style vertical feed instead passes `open`/`onOpenChange`
          and supplies its own "Create" buttons (see FeedClient.tsx), so nothing renders here. */}
      {!controlled && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-full border border-muted2 bg-bg3 px-4 py-2.5 text-left font-noto text-sm text-muted transition-colors hover:border-clay"
        >
          Share an update...
        </button>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 sm:items-center"
            onClick={resetComposer}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[92vh] w-full flex-col rounded-t-3xl bg-bg sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl"
            >
              {/* ---- Top row ---- */}
              <div className="flex shrink-0 items-center justify-between border-b border-bg4 px-4 py-3">
                <button type="button" onClick={resetComposer} aria-label="Close" className="text-text hover:text-clay2">
                  <X className="h-5 w-5" />
                </button>
                <p className="font-cinzel text-sm text-text">New Post</p>
                <button
                  type="button"
                  onClick={handlePost}
                  disabled={posting || savingDraft || !content.trim() || suspended}
                  title={suspended ? suspensionMessage(profile) : undefined}
                  className="rounded-full bg-clay px-4 py-1.5 font-syne text-sm font-semibold text-ivory disabled:opacity-40"
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setDraftsOpen(true)}
                    className="relative flex items-center gap-1.5 font-noto text-xs text-muted hover:text-clay2"
                  >
                    <FileEdit className="h-3.5 w-3.5" /> Drafts
                    {draftCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 font-noto text-[10px] font-semibold text-ivory">
                        {draftCount}
                      </span>
                    )}
                  </button>
                  <span className={`font-noto text-xs ${charsUsed >= 450 ? "font-semibold text-clay2" : "text-muted"}`}>
                    {charsUsed}/{MAX_CHARS}
                  </span>
                </div>

                {/* Role banner — For You eligibility + resolution-monetization framing. */}
                <div className="mt-3 rounded-lg border border-bg4 bg-bg3 px-3 py-2 font-noto text-[11px] text-muted">
                  {isPlatinum ? (
                    <span className="flex items-center gap-1.5 text-gold">
                      <Crown className="h-3.5 w-3.5" /> Platinum: your posts are eligible for For You and every
                      resolution tier is free.
                    </span>
                  ) : forYouEligible ? (
                    <span>Your posts are eligible to appear in For You. Boost a post or go Platinum for extra reach.</span>
                  ) : (
                    <span>Your posts appear in Following, but aren&apos;t yet eligible for the algorithmic For You feed.</span>
                  )}
                </div>

                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="What's on your mind?"
                  rows={6}
                  className="mt-3 w-full resize-none border-0 bg-transparent font-noto text-lg text-text placeholder:text-muted focus:outline-none focus:ring-0"
                />

                <div className="mt-2 flex flex-wrap gap-1.5 overflow-x-auto">
                  {POST_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                        type === t.value ? "border-clay bg-clay/15 text-clay2" : "border-muted2 bg-bg3 text-muted hover:border-clay"
                      }`}
                    >
                      <t.icon className="h-3.5 w-3.5" /> {t.label}
                    </button>
                  ))}
                </div>

                {sound && (
                  <div className="mt-3 flex items-center gap-2 self-start rounded-full border border-clay/40 bg-clay/10 py-1 pl-1 pr-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay/20 text-xs">🎵</span>
                    <span className="min-w-0 truncate font-noto text-xs text-text">
                      {sound.title} <span className="text-muted">— @{sound.uploaderHandle}</span>
                    </span>
                    <button type="button" onClick={() => setSound(null)} aria-label="Remove sound" className="shrink-0 text-muted hover:text-clay2">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {mediaKind === "photo" && (
                  <div className="mt-3 flex flex-col gap-2">
                    {images.length > 0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {images.map((img, i) => (
                          <div key={img.preview + i} className="group relative aspect-square overflow-hidden rounded-lg bg-bg3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img loading="lazy" src={img.preview} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(i)}
                              aria-label="Remove image"
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-ivory"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {images.length < MAX_IMAGES && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-muted2 text-muted hover:border-clay hover:text-clay2"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    )}
                    <ResolutionPicker kind="image" value={imageResolution} onChange={setImageResolution} isPlatinum={isPlatinum} />
                  </div>
                )}

                {mediaKind === "video" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <VideoUploader value={video} onChange={setVideo} />
                    <ResolutionPicker kind="video" value={videoResolution} onChange={setVideoResolution} isPlatinum={isPlatinum} />
                    <div className="flex items-center gap-2">
                      <span className="font-noto text-xs font-semibold text-muted">Edited with</span>
                      <select
                        value={editingApp}
                        onChange={(e) => setEditingApp(e.target.value as EditingApp | "")}
                        className="input-base w-auto py-1 text-xs"
                      >
                        {EDITING_APP_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {editingApp && <EditingAppBadge app={editingApp} />}
                    </div>
                  </div>
                )}

                {emojiOpen && (
                  <div className="mt-3 rounded-xl border border-bg4">
                    <EmojiPicker
                      onPick={(emoji) => {
                        insertAtCursor(emoji);
                      }}
                    />
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />
              </div>

              {/* ---- Bottom toolbar (fixed) ---- */}
              <div className="flex shrink-0 items-center justify-between border-t border-bg4 px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePhotoTap}
                    aria-label="Photo"
                    className={`rounded-full p-2.5 transition-transform active:scale-90 ${mediaKind === "photo" ? "bg-clay/15 text-clay2" : "text-muted hover:text-text"}`}
                  >
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaKind((k) => (k === "video" ? "none" : "video"))}
                    aria-label="Video"
                    className={`rounded-full p-2.5 transition-transform active:scale-90 ${mediaKind === "video" ? "bg-clay/15 text-clay2" : "text-muted hover:text-text"}`}
                  >
                    <Video className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoundPickerOpen(true)}
                    aria-label="Sound"
                    className={`rounded-full p-2.5 transition-transform active:scale-90 ${sound ? "bg-clay/15 text-clay2" : "text-muted hover:text-text"}`}
                  >
                    <Music className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor("#")}
                    aria-label="Hashtag"
                    className="rounded-full p-2.5 text-muted transition-transform hover:text-text active:scale-90"
                  >
                    <Hash className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((o) => !o)}
                    aria-label="Emoji"
                    className={`rounded-full p-2.5 transition-transform active:scale-90 ${emojiOpen ? "bg-clay/15 text-clay2" : "text-muted hover:text-text"}`}
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={posting || savingDraft}
                  className="font-noto text-xs font-semibold text-muted hover:text-clay2 disabled:opacity-40"
                >
                  {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Beta feedback bug: "Sound picker z-index" — the composer's own overlay is z-[210]; both
          of these used the shared Modal's z-100 default, so they rendered BEHIND it and were
          untappable. Same z-[130]/[131]-vs-Modal-z-100 issue found and fixed elsewhere this
          session (see ReportGroupModal.tsx). */}
      <SoundPicker open={soundPickerOpen} onClose={() => setSoundPickerOpen(false)} selected={sound} onSelect={setSound} zIndex={220} />
      <DraftsModal
        open={draftsOpen}
        onClose={() => {
          setDraftsOpen(false);
          refreshDraftCount();
        }}
        uid={user.uid}
        onResume={handleResumeDraft}
        zIndex={220}
      />
    </>
  );
}
