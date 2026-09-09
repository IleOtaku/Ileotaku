"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Crown,
  FileEdit,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Music,
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
import {
  chargeForResolution,
  createPost,
  deleteDraft,
  getForYouEligibility,
  saveDraft,
  type CreatePostInput,
  type UploadedVideo,
} from "@/lib/creatorFeed";
import { uploadImage } from "@/lib/cloudinary";
import { useAuth } from "@/hooks/useAuth";
import { initials, stringToColor } from "@/lib/utils";
import type { CreatorPost, CreatorPostType, EditingApp, Sound } from "@/types";

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
}

/** Collapsed "Share an update..." bar that expands into the full composer on click. Sprint 9b
 * adds: a Drafts button (save/resume in-progress posts), a Photo/Video media-kind chip with a
 * per-kind ResolutionPicker (the coin-cost UI for resolution-based monetization), an
 * editing-app disclosure dropdown for video posts, and a role banner explaining For You /
 * Platinum-resolution perks. */
export default function PostComposer({ onPosted }: PostComposerProps) {
  const { user, profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
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
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canPost = profile?.isCreator === true || profile?.isPublisher === true;
  if (!user || !profile || !canPost) return null;

  const displayName = profile.displayName ?? user.displayName ?? "Creator";
  const charsLeft = MAX_CHARS - content.length;
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
    setExpanded(false);
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
    };
  }

  async function handlePost() {
    if (!user || !profile) return;
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
        editingApp: mediaKind === "video" ? (editingApp || null) : undefined,
        forYouEligible,
      };

      if (mediaKind === "video" && !video?.url) {
        toast.error("Wait for the video to finish uploading first.");
        setPosting(false);
        return;
      }

      await createPost(input);
      if (draftId) await deleteDraft(user.uid, draftId);
      toast.success("Posted!");
      resetComposer();
      onPosted?.();
    } catch {
      toast.error("Couldn't publish your post. Please try again.");
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
        editingApp: mediaKind === "video" ? (editingApp || null) : undefined,
        forYouEligible,
      });
      setDraftId(newId);
      toast.success("Draft saved.");
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
    setVideo(draft.videoUrl ? { url: draft.videoUrl, posterUrl: draft.videoPosterUrl ?? "", duration: draft.videoDuration ?? 0 } : null);
    setMediaKind(draft.mediaType === "video" ? "video" : draft.mediaType === "image" || draft.mediaType === "images" ? "photo" : "none");
    setSound(
      draft.soundId
        ? ({
            id: draft.soundId,
            title: draft.soundTitle ?? "",
            artist: draft.soundArtist ?? "",
            url: draft.soundUrl ?? "",
            duration: draft.soundDuration ?? 0,
            source: draft.soundSource ?? "library",
            category: draft.soundCategory ?? "Chill",
            usageCount: 0,
          } as Sound)
        : null
    );
    setDraftsOpen(false);
    setExpanded(true);
  }

  return (
    <div id="post-composer" className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <div className="flex items-start gap-3">
        {profile.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            src={profile.photoURL}
            alt={displayName}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-syne text-sm font-bold text-ivory"
            style={{ backgroundColor: stringToColor(displayName) }}
          >
            {initials(displayName)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {!expanded ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full rounded-full border border-muted2 bg-bg3 px-4 py-2.5 text-left font-noto text-sm text-muted transition-colors hover:border-clay"
              >
                Share an update...
              </button>
              <button
                type="button"
                onClick={() => setDraftsOpen(true)}
                className="btn-ghost shrink-0 text-xs"
              >
                <FileEdit className="h-4 w-4" /> Drafts
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-noto text-xs font-semibold text-muted">
                  {draftId ? "Editing a draft" : "New post"}
                </span>
                <button
                  type="button"
                  onClick={() => setDraftsOpen(true)}
                  className="flex items-center gap-1 font-noto text-xs text-muted hover:text-clay2"
                >
                  <FileEdit className="h-3.5 w-3.5" /> Drafts
                </button>
              </div>

              {/* Role banner — For You eligibility + resolution-monetization framing. */}
              <div className="rounded-lg border border-bg4 bg-bg3 px-3 py-2 font-noto text-[11px] text-muted">
                {isPlatinum ? (
                  <span className="flex items-center gap-1.5 text-gold">
                    <Crown className="h-3.5 w-3.5" /> Platinum: your posts are eligible for For You and every
                    resolution tier is free.
                  </span>
                ) : forYouEligible ? (
                  <span>
                    Your posts are eligible to appear in For You. Boost a post or go Platinum for extra reach.
                  </span>
                ) : (
                  <span>Your posts appear in Following, but aren&apos;t yet eligible for the algorithmic For You feed.</span>
                )}
              </div>

              <textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Share an update..."
                rows={4}
                className="input-base resize-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {POST_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                        type === t.value
                          ? "border-clay bg-clay/15 text-clay2"
                          : "border-muted2 bg-bg3 text-muted hover:border-clay"
                      }`}
                    >
                      <t.icon className="h-3.5 w-3.5" /> {t.label}
                    </button>
                  ))}
                </div>
                <span
                  className={`shrink-0 font-noto text-xs ${
                    charsLeft <= 50 ? "font-semibold text-clay2" : "text-muted"
                  }`}
                >
                  {charsLeft}
                </span>
              </div>

              {/* Media kind chips: Photo / Video (mutually exclusive) */}
              <div className="flex flex-wrap gap-1.5">
                {(["photo", "video"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setMediaKind((current) => (current === kind ? "none" : kind))}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                      mediaKind === kind
                        ? "border-clay bg-clay/15 text-clay2"
                        : "border-muted2 bg-bg3 text-muted hover:border-clay"
                    }`}
                  >
                    {kind === "photo" ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                    {kind === "photo" ? "Photo" : "Video"}
                  </button>
                ))}
              </div>

              {mediaKind === "photo" && (
                <>
                  {images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img, i) => (
                        <div key={img.preview + i} className="group relative aspect-square overflow-hidden rounded-lg bg-bg3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
            loading="lazy" src={img.preview} alt="" className="h-full w-full object-cover" />
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
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= MAX_IMAGES}
                    className="btn-ghost self-start text-xs disabled:opacity-40"
                  >
                    <ImageIcon className="h-4 w-4" /> Add images ({images.length}/{MAX_IMAGES})
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                  <ResolutionPicker kind="image" value={imageResolution} onChange={setImageResolution} isPlatinum={isPlatinum} />
                </>
              )}

              {mediaKind === "video" && (
                <>
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
                </>
              )}

              {sound && (
                <div className="flex items-center gap-2 self-start rounded-full border border-clay/40 bg-clay/10 py-1 pl-1 pr-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay/20 text-xs">
                    🎵
                  </span>
                  <span className="min-w-0 truncate font-noto text-xs text-text">
                    {sound.title} <span className="text-muted">— {sound.artist}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSound(null)}
                    aria-label="Remove sound"
                    className="shrink-0 text-muted hover:text-clay2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSoundPickerOpen(true)}
                  className="btn-ghost text-xs"
                >
                  <Music className="h-4 w-4" /> {sound ? "Change Sound" : "Add Sound"}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetComposer}
                    disabled={posting || savingDraft}
                    className="btn-ghost text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={posting || savingDraft}
                    className="btn-ghost text-sm"
                  >
                    {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePost}
                    disabled={posting || savingDraft || !content.trim()}
                    className="btn-primary text-sm"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <SoundPicker
        open={soundPickerOpen}
        onClose={() => setSoundPickerOpen(false)}
        selected={sound}
        onSelect={setSound}
      />
      <DraftsModal open={draftsOpen} onClose={() => setDraftsOpen(false)} uid={user.uid} onResume={handleResumeDraft} />
    </div>
  );
}
