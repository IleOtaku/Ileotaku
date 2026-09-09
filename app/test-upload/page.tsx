"use client";

import { useRef, useState } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { uploadAudio, uploadImage, uploadVideo, type CloudinaryUploadResult } from "@/lib/cloudinary";

type Kind = "image" | "video" | "audio";

interface SlotState {
  uploading: boolean;
  progress: number;
  result: CloudinaryUploadResult | null;
  error: string | null;
}

const EMPTY_SLOT: SlotState = { uploading: false, progress: 0, result: null, error: null };

const SLOTS: { kind: Kind; label: string; accept: string; folder: string }[] = [
  { kind: "image", label: "Image", accept: "image/*", folder: "test-uploads/images" },
  { kind: "video", label: "Video", accept: "video/mp4,video/webm,video/quicktime", folder: "test-uploads/videos" },
  { kind: "audio", label: "Audio", accept: "audio/mpeg,audio/wav,audio/ogg", folder: "test-uploads/audio" },
];

/** Development-only diagnostics page — lets Cloudinary's config (cloud name + unsigned upload
 * preset) be verified in isolation before trusting it inside real upload flows (avatar, cover
 * art, feed composer). Never meant to ship: redirects away in production. */
export default function TestUploadPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  const [state, setState] = useState<Record<Kind, SlotState>>({
    image: EMPTY_SLOT,
    video: EMPTY_SLOT,
    audio: EMPTY_SLOT,
  });
  const fileRefs = {
    image: useRef<HTMLInputElement>(null),
    video: useRef<HTMLInputElement>(null),
    audio: useRef<HTMLInputElement>(null),
  };
  const pickedFiles = useRef<Partial<Record<Kind, File>>>({});

  function handlePick(kind: Kind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    pickedFiles.current[kind] = file;
    setState((s) => ({ ...s, [kind]: { ...EMPTY_SLOT } }));
  }

  async function handleUpload(kind: Kind, folder: string) {
    const file = pickedFiles.current[kind];
    if (!file) return;
    setState((s) => ({ ...s, [kind]: { uploading: true, progress: 0, result: null, error: null } }));
    try {
      const result =
        kind === "image"
          ? await uploadImage(file, folder)
          : kind === "video"
            ? await uploadVideo(file, folder, (progress) =>
                setState((s) => ({ ...s, video: { ...s.video, progress } }))
              )
            : await uploadAudio(file, folder);
      setState((s) => ({ ...s, [kind]: { uploading: false, progress: 100, result, error: null } }));
    } catch (error) {
      setState((s) => ({
        ...s,
        [kind]: { uploading: false, progress: 0, result: null, error: error instanceof Error ? error.message : "Upload failed." },
      }));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-cinzel text-2xl text-text">Cloudinary Test Upload</h1>
      <p className="mt-2 font-noto text-sm text-muted">
        Development-only page for verifying Cloudinary uploads in isolation. Requires
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {SLOTS.map(({ kind, label, accept, folder }) => {
          const slot = state[kind];
          return (
            <div key={kind} className="rounded-2xl border border-bg4 bg-bg2 p-5">
              <h2 className="font-syne text-sm font-semibold text-text">{label}</h2>
              <p className="mt-1 font-noto text-xs text-muted">folder: {folder}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  ref={fileRefs[kind]}
                  type="file"
                  accept={accept}
                  onChange={(e) => handlePick(kind, e)}
                  className="font-noto text-xs text-text file:mr-3 file:rounded-full file:border-0 file:bg-bg3 file:px-3 file:py-1.5 file:font-noto file:text-xs file:text-text"
                />
                <button
                  type="button"
                  onClick={() => handleUpload(kind, folder)}
                  disabled={slot.uploading}
                  className="btn-primary text-sm"
                >
                  {slot.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
                </button>
              </div>

              {kind === "video" && slot.uploading && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg4">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-clay to-gold transition-all duration-150"
                      style={{ width: `${slot.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 font-noto text-xs text-muted">Uploading... {slot.progress}%</p>
                </div>
              )}

              {slot.error && <p className="mt-3 font-noto text-xs text-clay2">{slot.error}</p>}

              {slot.result && (
                <div className="mt-3 flex flex-col gap-2">
                  <a
                    href={slot.result.secureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-noto text-xs text-gold hover:underline"
                  >
                    {slot.result.secureUrl}
                  </a>
                  <p className="font-noto text-[11px] text-muted">public_id: {slot.result.publicId}</p>

                  {kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
            loading="lazy" src={slot.result.secureUrl} alt="Uploaded preview" className="max-h-64 rounded-lg" />
                  )}
                  {kind === "video" && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={slot.result.secureUrl} controls className="max-h-64 rounded-lg" />
                  )}
                  {kind === "audio" && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio src={slot.result.secureUrl} controls className="w-full" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
