"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Video, X } from "lucide-react";
import { uploadPostVideo, type UploadedVideo } from "@/lib/creatorFeed";
import { addWatermarkToVideo } from "@/lib/videoWatermark";
import { useAuth } from "@/hooks/useAuth";

export interface VideoUploaderProps {
  value: UploadedVideo | null;
  onChange: (video: UploadedVideo | null) => void;
}

/** Video-attach control for the post composer — picks a local file, uploads it (plus a derived
 * poster frame) to Storage via uploadPostVideo(), and hands the resulting {url, posterUrl,
 * duration} back to the composer once done. Shows a local <video> preview immediately (from an
 * object URL) so the creator sees their clip while the upload is still in flight. */
export default function VideoUploader({ value, onChange }: VideoUploaderProps) {
  const { user, profile } = useAuth();
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // PART 8 — video watermarking: "Adding ÍléOtaku watermark... 45%" vs the plain upload-percent
  // label, so a creator can tell which of the two (sequential) phases is actually in progress.
  const [watermarking, setWatermarking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Default ON — an absent creatorSettings.videoWatermark (every account before this setting
  // existed) reads as "watermark on", matching the type's own doc comment in types/index.ts.
  const watermarkEnabled = profile?.creatorSettings?.videoWatermark !== false;

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setUploading(true);
    setProgress(0);
    try {
      let fileToUpload: File = file;
      if (watermarkEnabled) {
        setWatermarking(true);
        try {
          const watermarked = await addWatermarkToVideo(file, "ÍléOtaku", setProgress);
          fileToUpload = new File([watermarked], file.name.replace(/\.[^.]+$/, ".webm"), { type: "video/webm" });
        } catch {
          // Best-effort — a watermarking failure (an unsupported browser, mainly) shouldn't block
          // the post itself; falls back to uploading the original, unwatermarked file.
          toast.error("Couldn't add a watermark — uploading the original video instead.");
        } finally {
          setWatermarking(false);
        }
      }
      setProgress(0);
      const uploaded = await uploadPostVideo(user.uid, fileToUpload, setProgress);
      onChange(uploaded);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload this video.");
      URL.revokeObjectURL(preview);
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    onChange(null);
  }

  if (value || (localPreview && uploading)) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-bg4 bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={value?.url ?? localPreview ?? undefined}
          poster={value?.posterUrl}
          className="max-h-[360px] w-full object-contain"
          controls={!uploading}
          muted
          playsInline
        />
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <Loader2 className="h-6 w-6 animate-spin text-ivory" />
            <span className="font-noto text-xs text-ivory">
              {watermarking ? `Adding ÍléOtaku watermark... ${progress}%` : `Uploading… ${progress}%`}
            </span>
          </div>
        )}
        {!uploading && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove video"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-ivory"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn-ghost text-xs"
      >
        <Video className="h-4 w-4" /> Add video
      </button>
      {watermarkEnabled && (
        <p className="font-noto text-[11px] text-muted">A watermark is added to protect your content.</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileSelected}
        className="hidden"
      />
    </div>
  );
}
