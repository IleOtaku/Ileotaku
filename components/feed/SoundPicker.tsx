"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, Music, Music2, Pause, Pencil, Play, Search, Trash2, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { cn, stringToColor } from "@/lib/utils";
import {
  deleteCreatorSound,
  getCreatorSounds,
  getTrendingSounds,
  getVideoSounds,
  renameSound,
  searchSounds,
  setSoundDuration,
  uploadSoundToLibrary,
} from "@/lib/sounds";
import type { Sound } from "@/types";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface SoundPickerProps {
  open: boolean;
  onClose: () => void;
  selected: Sound | null;
  onSelect: (sound: Sound | null) => void;
  /** The composer this opens from renders its own overlay above the rest of the page (z-[210]) —
   * this needs to sit above THAT, or it renders invisibly behind it. See PostComposer.tsx. */
  zIndex?: number;
}

type PickerTab = "all" | "videos" | "mine";

const TABS: { value: PickerTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "videos", label: "From Videos" },
  { value: "mine", label: "My Sounds" },
];

/**
 * Sound-selection modal opened from the post composer's "🎵 Add Sound" button.
 *
 * Beta feedback: "Clean up the sound library and build creator-driven sound uploads." The old
 * curated/seeded library (5 genre categories, SoundHelix placeholder tracks) is gone entirely —
 * every sound here is creator-uploaded, either extracted from a video post's own audio ("From
 * Videos") or uploaded directly to the library ("My Sounds"). The library starts empty and
 * self-curates purely from usageCount as creators actually use sounds; there's no "Spotify" tab —
 * that was already removed in an earlier round (Spotify killed third-party preview_url access in
 * Nov 2024, so a search tab with nothing playable had nothing left to offer).
 */
export default function SoundPicker({ open, onClose, selected, onSelect, zIndex }: SoundPickerProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<PickerTab>("all");

  // ---- All tab state ----
  const [allSearch, setAllSearch] = useState("");
  const [allSounds, setAllSounds] = useState<Sound[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [trending, setTrending] = useState<Sound[]>([]);

  // ---- From Videos tab state ----
  const [videoSounds, setVideoSounds] = useState<Sound[]>([]);
  const [videoSoundsLoading, setVideoSoundsLoading] = useState(true);

  // ---- My Sounds tab state ----
  const [mySounds, setMySounds] = useState<Sound[]>([]);
  const [mySoundsLoading, setMySoundsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // ---- Shared audio preview ----
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAllLoading(true);
    Promise.all([searchSounds(allSearch), getTrendingSounds(6)])
      .then(([library, top]) => {
        setAllSounds(library);
        setTrending(top);
      })
      .finally(() => setAllLoading(false));
  }, [open, allSearch]);

  useEffect(() => {
    if (!open) return;
    setVideoSoundsLoading(true);
    getVideoSounds()
      .then(setVideoSounds)
      .finally(() => setVideoSoundsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    setMySoundsLoading(true);
    getCreatorSounds(user.uid)
      .then(setMySounds)
      .finally(() => setMySoundsLoading(false));
  }, [open, user]);

  // Stop any preview and reset picker-local UI state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      setRenamingId(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  function togglePreview(sound: Sound) {
    let audio = previewAudioRef.current;
    if (!audio) {
      audio = new Audio();
      previewAudioRef.current = audio;
    }
    audio.onended = () => setPreviewingId(null);
    if (previewingId === sound.id) {
      audio.pause();
      setPreviewingId(null);
      return;
    }
    audio.src = sound.url;
    audio.currentTime = 0;
    // Beta feedback: "duration: null, populated client-side after load" — the first viewer to
    // ever preview a sound with no known duration backfills it (firestore.rules only allows this
    // while it's still unset, so it can never overwrite an already-known value).
    if (sound.duration == null) {
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio!.duration)) setSoundDuration(sound.id, Math.round(audio!.duration)).catch(() => {});
      };
    } else {
      audio.onloadedmetadata = null;
    }
    audio.play().catch(() => toast.error("Couldn't play this preview."));
    setPreviewingId(sound.id);
  }

  function handleSelectSound(sound: Sound) {
    onSelect(sound);
    previewAudioRef.current?.pause();
    setPreviewingId(null);
    onClose();
  }

  function handleClearSound() {
    onSelect(null);
    onClose();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploadProgress(0);
    try {
      await uploadSoundToLibrary(
        user.uid,
        file,
        file.name.replace(/\.[^.]+$/, ""),
        profile?.displayName ?? "A creator",
        profile?.handle ?? user.uid,
        setUploadProgress
      );
      toast.success("Sound uploaded!");
      const fresh = await getCreatorSounds(user.uid);
      setMySounds(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload this sound.");
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleDeleteSound(sound: Sound) {
    try {
      await deleteCreatorSound(sound);
      setMySounds((prev) => prev.filter((s) => s.id !== sound.id));
      toast.success("Sound deleted.");
    } catch {
      toast.error("Couldn't delete this sound.");
    }
  }

  function startRename(sound: Sound) {
    setRenamingId(sound.id);
    setRenameDraft(sound.title);
  }

  async function commitRename(sound: Sound) {
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!next || next === sound.title) return;
    try {
      await renameSound(sound.id, next);
      setMySounds((prev) => prev.map((s) => (s.id === sound.id ? { ...s, title: next, titleLower: next.toLowerCase() } : s)));
    } catch {
      toast.error("Couldn't rename this sound.");
    }
  }

  function SoundCard({ sound, onDelete }: { sound: Sound; onDelete?: () => void }) {
    const isSelected = selected?.id === sound.id;
    const isPreviewing = previewingId === sound.id;
    const isRenaming = renamingId === sound.id;
    return (
      <div
        onClick={() => !isRenaming && handleSelectSound(sound)}
        className={cn(
          "group flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white/[0.04]",
          isSelected && "bg-clay/10"
        )}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: stringToColor(sound.uploadedBy) }}
        >
          <Music className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(sound)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="input-base py-1 text-sm"
            />
          ) : (
            <p className="truncate font-syne text-sm font-semibold text-text">{sound.title}</p>
          )}
          <p className="truncate font-noto text-xs text-muted">
            @{sound.uploaderHandle} · {sound.usageCount.toLocaleString()} {sound.usageCount === 1 ? "use" : "uses"} ·{" "}
            {formatDuration(sound.duration)}
          </p>
        </div>

        {onDelete && !isRenaming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startRename(sound);
            }}
            aria-label="Rename sound"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-bg3 hover:text-text group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete sound"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-clay/10 hover:text-clay2 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePreview(sound);
          }}
          aria-label={isPreviewing ? "Pause preview" : "Play preview"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {isPreviewing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectSound(sound);
          }}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 font-noto text-xs",
            isSelected ? "bg-clay text-white" : "bg-white/10 text-muted hover:text-text"
          )}
        >
          {isSelected ? (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" /> Selected
            </span>
          ) : (
            "Use"
          )}
        </button>
      </div>
    );
  }

  function TrendingRow() {
    if (trending.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="font-syne text-xs font-semibold text-muted">🔥 Trending</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {trending.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelectSound(s)}
              className="flex w-32 shrink-0 flex-col items-start gap-1.5 rounded-xl border border-bg4 bg-bg2 p-2.5 text-left hover:border-clay"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: stringToColor(s.uploadedBy) }}
              >
                <Music className="h-3.5 w-3.5" />
              </div>
              <p className="w-full truncate font-noto text-xs font-semibold text-text">{s.title}</p>
              <p className="w-full truncate font-noto text-[10px] text-muted">@{s.uploaderHandle}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} zIndex={zIndex} title="Add Sound">
      {/* No nested max-h/overflow-y-auto wrapper here — the Modal's own content area is
          already the one scroll container (see components/ui/index.tsx). Nesting a second
          scrolling region inside it fights the outer one over which actually scrolls, and in
          practice the OUTER one wins, dragging this tab row along with it instead of keeping it
          pinned. Making the tab row itself `sticky top-0` within that single shared scroll
          container is what actually keeps it visible while the rest scrolls beneath it — the
          negative margins cancel the Modal content area's own padding so the sticky bar's
          background reaches edge-to-edge instead of leaving a gap on the sides. */}
      <div className="flex flex-col gap-4">
        <div className="sticky -top-4 z-10 -mx-6 -mt-4 flex justify-center bg-bg2/95 px-6 pb-3 pt-4 backdrop-blur">
          <div className="inline-flex rounded-full border border-muted2 bg-bg3 p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`rounded-full px-3.5 py-1.5 font-syne text-xs font-semibold transition-colors ${
                  tab === t.value ? "bg-clay text-ivory" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <button
            type="button"
            onClick={handleClearSound}
            className="flex items-center gap-1.5 self-start rounded-full border border-clay/40 bg-clay/5 px-3 py-1 font-noto text-xs text-clay2 hover:bg-clay/10"
          >
            <X className="h-3 w-3" /> Clear sound
          </button>
        )}

        {tab === "all" && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={allSearch}
                onChange={(e) => setAllSearch(e.target.value)}
                placeholder="Search title or @handle..."
                className="input-base pl-9"
              />
            </div>

            {!allSearch.trim() && <TrendingRow />}

            {allLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : allSounds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Music2 className="h-6 w-6 text-muted" />
                <p className="font-syne text-sm font-semibold text-text">No sounds yet</p>
                <p className="max-w-xs font-noto text-xs text-muted">
                  Be the first creator to upload one, or post a video — its audio joins the library automatically.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {allSounds.map((s) => (
                  <SoundCard key={s.id} sound={s} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "videos" && (
          <div className="flex flex-col gap-3">
            {videoSoundsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : videoSounds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Music2 className="h-6 w-6 text-muted" />
                <p className="font-syne text-sm font-semibold text-text">No video sounds yet</p>
                <p className="max-w-xs font-noto text-xs text-muted">
                  Every video post&apos;s own audio shows up here automatically, for other creators to reuse.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {videoSounds.map((s) => (
                  <SoundCard key={s.id} sound={s} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "mine" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress !== null}
              className="btn-ghost w-full justify-center text-sm disabled:opacity-60"
            >
              {uploadProgress !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading... {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload sound (MP3/WAV/OGG/M4A, under 10MB)
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a"
              onChange={handleUpload}
              className="hidden"
            />

            {mySoundsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : mySounds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Music2 className="h-6 w-6 text-muted" />
                <p className="font-syne text-sm font-semibold text-text">
                  Upload your original music or voice notes
                </p>
                <p className="max-w-xs font-noto text-xs text-muted">
                  Sounds you upload appear here, and any video you post adds its own audio here too.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {mySounds.map((s) => (
                  <SoundCard key={s.id} sound={s} onDelete={() => handleDeleteSound(s)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
