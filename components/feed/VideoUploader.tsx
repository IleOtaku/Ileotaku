"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Video, X } from "lucide-react";
import { uploadPostVideo, type UploadedVideo } from "@/lib/creatorFeed";
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
  const { user } = useAuth();
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await uploadPostVideo(user.uid, file, setProgress);
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
            <span className="font-noto text-xs text-ivory">Uploading… {progress}%</span>
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
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn-ghost text-xs"
      >
        <Video className="h-4 w-4" /> Add video
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileSelected}
        className="hidden"
      />
    </>
  );
}
