"use client";

import { Camera, File, Film, Image as ImageIcon, Mic, Send, Smile, Sticker } from "lucide-react";

export interface AttachmentTrayProps {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onPhotoVideo: () => void;
  onVoice: () => void;
  onFile: () => void;
  onShareManga: () => void;
  onSharePost: () => void;
  onGif: () => void;
  onSticker: () => void;
}

const ITEMS = [
  { key: "camera", label: "Camera", icon: Camera, color: "bg-clay2" },
  { key: "photoVideo", label: "Photo/Video", icon: ImageIcon, color: "bg-purple-500" },
  { key: "voice", label: "Voice", icon: Mic, color: "bg-red-500" },
  { key: "file", label: "File", icon: File, color: "bg-blue-500" },
  { key: "shareManga", label: "Share Manga", icon: Film, color: "bg-green-600" },
  { key: "sharePost", label: "Share Post", icon: Send, color: "bg-gold2" },
  { key: "gif", label: "GIF", icon: Smile, color: "bg-pink-500" },
  { key: "sticker", label: "Sticker", icon: Sticker, color: "bg-indigo-500" },
] as const;

/** DM Feature Overhaul (Part A): the paperclip button's attachment tray — a grid of every
 * attachment type, each just raising its own callback; MessagesClient.tsx owns the actual
 * pickers/uploads/sendDM calls each one triggers. "Voice" here just reveals the composer's own
 * hold-to-record control (VoiceRecorder.tsx) rather than opening a modal, since recording is a
 * press-and-hold gesture, not a pick-and-confirm flow like the others. */
export default function AttachmentTray({
  open,
  onClose,
  onCamera,
  onPhotoVideo,
  onVoice,
  onFile,
  onShareManga,
  onSharePost,
  onGif,
  onSticker,
}: AttachmentTrayProps) {
  if (!open) return null;

  const handlers: Record<(typeof ITEMS)[number]["key"], () => void> = {
    camera: onCamera,
    photoVideo: onPhotoVideo,
    voice: onVoice,
    file: onFile,
    shareManga: onShareManga,
    sharePost: onSharePost,
    gif: onGif,
    sticker: onSticker,
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="relative z-20 grid grid-cols-4 gap-3 border-t border-bg4 bg-bg2 p-4">
        {ITEMS.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              handlers[key]();
              if (key !== "voice") onClose();
            }}
            className="flex flex-col items-center gap-1.5"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${color}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-noto text-[10px] text-muted">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
