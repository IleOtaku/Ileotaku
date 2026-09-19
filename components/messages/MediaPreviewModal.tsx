"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { File as FileIcon, FileArchive, FileAudio, FileText, Pause, Play, Plus, Volume2, VolumeX, X } from "lucide-react";
import { formatDuration } from "@/lib/voiceRecorder";

export const MAX_PREVIEW_ITEMS = 10;

export interface PreviewedMedia {
  file: File;
  kind: "image" | "video";
  width?: number;
  height?: number;
  /** Video length in seconds. */
  duration?: number;
}

export interface MediaPreviewResult {
  items: PreviewedMedia[];
  caption: string;
}

interface Item {
  id: string;
  file: File;
  url: string;
  kind: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(file: File) {
  const t = file.type;
  const n = file.name.toLowerCase();
  if (t === "application/pdf" || t.startsWith("text/") || /\.(docx?|txt|rtf|odt|xlsx?|pptx?|csv)$/.test(n)) return FileText;
  if (t.startsWith("audio/")) return FileAudio;
  if (/\.(zip|rar|7z|tar|gz)$/.test(n) || t.includes("zip") || t.includes("compressed")) return FileArchive;
  return FileIcon;
}

let idCounter = 0;
const nextId = () => `pv-${Date.now()}-${idCounter++}`;

function toItems(files: File[]): Item[] {
  return files
    .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
    .map((file) => ({ id: nextId(), file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" : "image" }));
}

/** Preview shown BEFORE any photo, video or file is sent (Telegram/WhatsApp style): see exactly what
 * will go out, add a caption, and cancel. Photos become a swipeable gallery where individual ones can be
 * removed (or more added); a video plays muted on a loop with our own controls; a file shows its
 * name, type icon and size. Nothing is uploaded until "Send" — the parent does that from `onSend`.
 * (Voice notes have their own inline preview in the composer — see VoiceNoteBars.) */
export default function MediaPreviewModal({
  files,
  kind,
  onCancel,
  onSend,
}: {
  /** Selected files; the modal is open while this is non-null. */
  files: File[] | null;
  kind: "media" | "file";
  onCancel: () => void;
  onSend: (result: MediaPreviewResult) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const galleryRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  // (Re)build the item list whenever a new selection arrives; free the object URLs on the way out.
  useEffect(() => {
    if (!files || kind !== "media") {
      setItems([]);
      return;
    }
    const built = toItems(files).slice(0, MAX_PREVIEW_ITEMS);
    setItems(built);
    setIndex(0);
    setCaption("");
    return () => built.forEach((i) => URL.revokeObjectURL(i.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, kind]);

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);
  useEffect(() => {
    if (files) setCaption("");
  }, [files]);

  useEffect(() => {
    if (!files) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [files, onCancel]);

  const patchItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  function removeItem(id: string) {
    const target = items.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.url);
    const next = items.filter((i) => i.id !== id);
    if (next.length === 0) {
      onCancel();
      return;
    }
    setItems(next);
    setIndex((i) => Math.min(i, next.length - 1));
  }

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const room = MAX_PREVIEW_ITEMS - items.length;
    const more = toItems(Array.from(picked)).slice(0, room);
    if (more.length > 0) setItems((prev) => [...prev, ...more]);
  }

  function scrollTo(i: number) {
    const el = galleryRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  }

  function handleSend() {
    if (kind === "file" && files?.[0]) {
      onSend({ items: [{ file: files[0], kind: "image" }], caption: caption.trim() });
      return;
    }
    if (items.length === 0) return;
    onSend({
      items: items.map(({ file, kind: k, width, height, duration }) => ({ file, kind: k, width, height, duration })),
      caption: caption.trim(),
    });
  }

  const title = useMemo(() => {
    if (kind === "file") return "Send File";
    const photos = items.filter((i) => i.kind === "image").length;
    const videos = items.length - photos;
    if (items.length === 1) return items[0].kind === "video" ? "Send Video" : "Send Photo";
    if (videos === 0) return `Send ${photos} Photos`;
    return `Send ${items.length} Items`;
  }, [items, kind]);

  if (!files || files.length === 0) return null;

  // ---------------------------- FILE ----------------------------
  if (kind === "file") {
    const file = files[0];
    const Icon = iconFor(file);
    const ext = (file.name.split(".").pop() ?? "").slice(0, 5).toUpperCase();
    return createPortal(
      <div className="fixed inset-0 z-[250] flex flex-col bg-black" role="dialog" aria-label="Send file">
        <div className="flex items-center justify-between p-4 text-white">
          <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-full p-1 hover:bg-white/10">
            <X className="h-6 w-6" />
          </button>
          <span className="font-syne font-semibold">{title}</span>
          <span className="w-8" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-white/[0.06] p-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
              <Icon className="h-10 w-10" />
            </span>
            <p className="break-all font-syne text-base font-semibold text-white" data-testid="file-name">{file.name}</p>
            <p className="font-noto text-sm text-white/60" data-testid="file-meta">
              {ext ? `${ext} · ` : ""}
              {formatBytes(file.size)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-black/60 p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Add a caption..."
            aria-label="Caption"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none"
          />
          <button type="button" onClick={handleSend} className="max-w-[45%] shrink-0 truncate rounded-full bg-clay px-5 py-2.5 font-syne text-sm font-semibold text-white">
            Send {file.name.length > 14 ? "file" : file.name}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ---------------------------- PHOTOS / VIDEOS ----------------------------
  return createPortal(
    <div className="fixed inset-0 z-[250] flex flex-col bg-black" role="dialog" aria-label={title}>
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-full p-1 text-white hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
        <span className="font-syne font-semibold text-white" data-testid="preview-title">{title}</span>
        <button type="button" onClick={handleSend} className="rounded-full bg-clay px-4 py-2 font-syne text-sm font-semibold text-white">
          Send
        </button>
      </div>

      <div
        ref={galleryRef}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
        data-testid="preview-gallery"
      >
        {items.map((item) => (
          <div key={item.id} className="relative flex h-full w-full shrink-0 snap-center items-center justify-center p-2" data-testid="preview-slide">
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                onLoad={(e) => patchItem(item.id, { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <PreviewVideo url={item.url} onMeta={(w, h, d) => patchItem(item.id, { width: w, height: h, duration: d })} />
            )}
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label="Remove this item"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {(items.length > 1 || items.length < MAX_PREVIEW_ITEMS) && (
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2" data-testid="preview-thumbs">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Show item ${i + 1}`}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-clay" : "border-transparent opacity-70"}`}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={item.url} muted className="h-full w-full object-cover" />
              )}
            </button>
          ))}
          {items.length < MAX_PREVIEW_ITEMS && (
            <>
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                aria-label="Add more photos or videos"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/40 text-white/70 hover:bg-white/10"
              >
                <Plus className="h-5 w-5" />
              </button>
              <input
                ref={addInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}

      <div className="bg-black/60 p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Add a caption..."
          aria-label="Caption"
          maxLength={500}
          className="w-full rounded-full bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none"
        />
      </div>
    </div>,
    document.body
  );
}

/** Video preview: autoplays muted on a loop, with our own play/pause, mute and duration. */
function PreviewVideo({ url, onMeta }: { url: string; onMeta: (w: number, h: number, d: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(0);

  return (
    <div className="relative flex max-h-full max-w-full items-center justify-center">
      <video
        ref={ref}
        src={url}
        autoPlay
        muted={muted}
        loop
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (Number.isFinite(v.duration)) {
            setDuration(v.duration);
            onMeta(v.videoWidth, v.videoHeight, Math.round(v.duration));
            return;
          }
          // Some recordings (browser-made WebM) carry no duration header, so `duration` is Infinity.
          // Seeking far past the end makes the browser work out the real length; then jump back.
          onMeta(v.videoWidth, v.videoHeight, 0);
          const fix = () => {
            v.removeEventListener("timeupdate", fix);
            if (Number.isFinite(v.duration)) {
              setDuration(v.duration);
              onMeta(v.videoWidth, v.videoHeight, Math.round(v.duration));
            }
            v.currentTime = 0;
          };
          v.addEventListener("timeupdate", fix);
          v.currentTime = 1e9;
        }}
        onClick={() => (ref.current?.paused ? ref.current.play() : ref.current?.pause())}
        className="max-h-full max-w-full cursor-pointer object-contain"
        data-testid="preview-video"
      />
      {duration > 0 && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white" data-testid="preview-video-duration">
          {formatDuration(duration)}
        </span>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (ref.current?.paused ? ref.current.play() : ref.current?.pause())}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
        >
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
