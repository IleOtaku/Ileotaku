"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, Loader2, Type, Video, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  createStory,
  getUserStories,
  MAX_ACTIVE_STORIES,
  MAX_VIDEO_SECONDS_FREE,
  MAX_VIDEO_SECONDS_PLATINUM,
  PLATINUM_STORY_DURATIONS,
  type StoryMedia,
} from "@/lib/stories";

export interface StoryCreateModalProps {
  open: boolean;
  onClose: () => void;
}

const BG_COLORS = ["#c4622d", "#d4a843", "#3d6b4f", "#1a1510", "#7c3aed", "#0369a1"];

/** Full-screen story creation flow: pick an image/video to upload, or write a text story on a
 * colored background. Platinum accounts get a duration picker (5min-5days); everyone else is
 * silently locked to the default 24h by createStory() itself, not just this UI. */
export default function StoryCreateModal({ open, onClose }: StoryCreateModalProps) {
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<"picker" | "text" | "preview" | "add-another">("picker");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "video">("image");
  const [textContent, setTextContent] = useState("");
  const [backgroundColor, setBackgroundColor] = useState(BG_COLORS[0]);
  const [durationMs, setDurationMs] = useState(PLATINUM_STORY_DURATIONS[4].ms); // 24h default
  const [submitting, setSubmitting] = useState(false);
  const [activeStoryCount, setActiveStoryCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    getUserStories(user.uid).then((s) => setActiveStoryCount(s.length));
    // Re-checked after each successful share (mode flips to "add-another") so the limit reflects
    // the story just added without a full modal remount.
  }, [open, user, mode]);

  if (!open || !user) return null;

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setMode("picker");
    setFile(null);
    setPreviewUrl(null);
    setTextContent("");
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const isVideo = picked.type.startsWith("video/");

    if (isVideo) {
      // Checked against the file's REAL duration (not just its container/size), per Part 7's
      // spec — 30s for a free account, 90s for Platinum. Read via a throwaway <video> element's
      // loadedmetadata event, the standard way to get a picked file's duration before upload.
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(probe.src);
        const maxSeconds = profile?.isPlatinum ? MAX_VIDEO_SECONDS_PLATINUM : MAX_VIDEO_SECONDS_FREE;
        if (probe.duration > maxSeconds) {
          toast.error(`Video must be under ${MAX_VIDEO_SECONDS_FREE}s (${MAX_VIDEO_SECONDS_PLATINUM}s for Platinum)`);
          e.target.value = "";
          return;
        }
        setFile(picked);
        setFileKind("video");
        setPreviewUrl(URL.createObjectURL(picked));
        setMode("preview");
      };
      probe.src = URL.createObjectURL(picked);
      return;
    }

    setFile(picked);
    setFileKind("image");
    setPreviewUrl(URL.createObjectURL(picked));
    setMode("preview");
  }

  async function handleShare() {
    if (!user || !profile) return;
    if (mode === "text" && !textContent.trim()) {
      toast.error("Write something first.");
      return;
    }
    setSubmitting(true);
    try {
      const media: StoryMedia =
        mode === "text"
          ? { kind: "text", textContent: textContent.trim(), backgroundColor }
          : { kind: fileKind, file: file ?? undefined };
      await createStory(user.uid, profile, media, durationMs);
      toast.success("Story shared!");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setTextContent("");
      setMode("add-another");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't share your story. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={handleClose} aria-label="Close" className="text-text">
          <X className="h-6 w-6" />
        </button>
        {(mode === "text" || mode === "preview") && (
          <button
            type="button"
            onClick={handleShare}
            disabled={submitting}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share to Story"}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {mode === "picker" && (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-4 text-left hover:border-gold"
            >
              <ImagePlus className="h-6 w-6 text-gold" />
              <div>
                <p className="font-syne text-sm font-semibold text-text">Upload Image</p>
                <p className="font-noto text-xs text-muted">From your device</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-4 text-left hover:border-gold"
            >
              <Video className="h-6 w-6 text-gold" />
              <div>
                <p className="font-syne text-sm font-semibold text-text">Upload Video</p>
                <p className="font-noto text-xs text-muted">From your device</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className="flex items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-4 text-left hover:border-gold"
            >
              <Type className="h-6 w-6 text-gold" />
              <div>
                <p className="font-syne text-sm font-semibold text-text">Text Story</p>
                <p className="font-noto text-xs text-muted">Write on a colored background</p>
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFilePicked} className="hidden" />
          </div>
        )}

        {mode === "add-another" && (
          <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center">
            <span className="text-4xl">✅</span>
            <p className="font-cinzel text-lg text-text">Story shared!</p>
            <p className="font-noto text-sm text-muted">Add another story?</p>
            <div className="flex w-full gap-2">
              <button type="button" onClick={handleClose} className="btn-ghost flex-1">
                Done
              </button>
              <button
                type="button"
                onClick={() => setMode("picker")}
                disabled={activeStoryCount >= MAX_ACTIVE_STORIES}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Add Another
              </button>
            </div>
            {activeStoryCount >= MAX_ACTIVE_STORIES && (
              <p className="font-noto text-xs text-muted">
                You&apos;ve reached the {MAX_ACTIVE_STORIES}-story limit — delete one to add another.
              </p>
            )}
          </div>
        )}

        {mode === "text" && (
          <div
            className="flex aspect-[9/16] w-full max-w-xs flex-col items-center justify-center gap-6 rounded-2xl p-6"
            style={{ background: backgroundColor }}
          >
            <textarea
              autoFocus
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Type your story..."
              rows={4}
              className="w-full resize-none border-none bg-transparent text-center font-cinzel text-2xl text-white placeholder:text-white/50 focus:outline-none"
            />
            <div className="flex gap-2">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBackgroundColor(c)}
                  aria-label={`Background color ${c}`}
                  className={`h-7 w-7 rounded-full border-2 ${backgroundColor === c ? "border-white" : "border-white/30"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}

        {mode === "preview" && previewUrl && (
          <div className="flex aspect-[9/16] w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl bg-black">
            {fileKind === "video" ? (
              <video src={previewUrl} controls className="h-full w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-contain" />
            )}
          </div>
        )}

        {profile?.isPlatinum && (mode === "text" || mode === "preview") && (
          <div className="w-full max-w-xs">
            <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Story duration (Platinum)</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATINUM_STORY_DURATIONS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDurationMs(d.ms)}
                  className={`rounded-full border px-2.5 py-1 font-noto text-[11px] transition-colors ${
                    durationMs === d.ms ? "border-clay bg-clay text-ivory" : "border-muted2 bg-bg3 text-muted"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
