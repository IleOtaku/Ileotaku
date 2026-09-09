"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Check,
  Loader2,
  Music,
  Music2,
  Pause,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile } from "@/lib/firestore";
import {
  deleteCreatorSound,
  getCreatorSounds,
  getSoundLibrary,
  searchSounds,
  uploadCreatorSound,
} from "@/lib/sounds";
import { connectSpotify, searchTracks, type SpotifySearchTrack } from "@/lib/spotify";
import type { Sound, SoundCategory } from "@/types";

type SpotifyTrack = SpotifySearchTrack;

const CATEGORIES: (SoundCategory | "All")[] = [
  "All",
  "African Beats",
  "Intense",
  "Romantic",
  "Chill",
  "Epic",
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface SoundPickerProps {
  open: boolean;
  onClose: () => void;
  selected: Sound | null;
  onSelect: (sound: Sound | null) => void;
}

type PickerTab = "library" | "mySounds" | "spotify";

/** Sound-selection modal opened from the post composer's "🎵 Add Sound" button. Three tabs:
 * the shared library, the signed-in creator's own uploads, and a Spotify 30-second-preview
 * search. Each tab's "Select" hands a Sound-shaped object back to the caller via onSelect. */
export default function SoundPicker({ open, onClose, selected, onSelect }: SoundPickerProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PickerTab>("library");

  // ---- Library tab state ----
  const [category, setCategory] = useState<SoundCategory | "All">("All");
  const [libSearch, setLibSearch] = useState("");
  const [librarySounds, setLibrarySounds] = useState<Sound[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // ---- My Sounds tab state ----
  const [mySounds, setMySounds] = useState<Sound[]>([]);
  const [mySoundsLoading, setMySoundsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Spotify tab state ----
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrack[]>([]);
  const [spotifySearching, setSpotifySearching] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  // ---- Shared audio preview ----
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLibraryLoading(true);
    getSoundLibrary()
      .then(setLibrarySounds)
      .finally(() => setLibraryLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    setMySoundsLoading(true);
    getCreatorSounds(user.uid)
      .then(setMySounds)
      .finally(() => setMySoundsLoading(false));
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return;
    getUserProfile(user.uid).then((p) => setSpotifyConnected(p?.spotifyConnected === true));
  }, [open, user]);

  // Stop any preview and reset picker-local UI state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  function togglePreview(id: string, url: string) {
    let audio = previewAudioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.addEventListener("ended", () => setPreviewingId(null));
      previewAudioRef.current = audio;
    }
    if (previewingId === id) {
      audio.pause();
      setPreviewingId(null);
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(() => toast.error("Couldn't play this preview."));
    setPreviewingId(id);
  }

  async function runLibraryFilter() {
    setLibraryLoading(true);
    try {
      const base = libSearch.trim() ? await searchSounds(libSearch.trim()) : await getSoundLibrary();
      setLibrarySounds(category === "All" ? base : base.filter((s) => s.category === category));
    } finally {
      setLibraryLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(runLibraryFilter, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, libSearch, open]);

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
      await uploadCreatorSound(user.uid, file, file.name.replace(/\.[^.]+$/, ""), setUploadProgress);
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

  function handleConnectSpotify() {
    if (!user) return;
    // Navigates away to Spotify's consent screen — nothing to await here, the
    // /auth/spotify/callback page finishes the flow and returns to Settings.
    connectSpotify(user.uid);
  }

  async function handleSpotifySearch(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const q = spotifyQuery.trim();
    if (!q) return;
    setSpotifySearching(true);
    setSpotifyError(null);
    try {
      const tracks = await searchTracks(user.uid, q);
      setSpotifyResults(tracks);
      if (tracks.length === 0) setSpotifyError(null);
    } catch {
      setSpotifyError("Spotify search is unavailable right now.");
      setSpotifyResults([]);
    } finally {
      setSpotifySearching(false);
    }
  }

  function handleSelectSpotifyTrack(track: SpotifyTrack) {
    if (!track.previewUrl) {
      toast.error("This track has no 30-second preview available.");
      return;
    }
    const asSound: Sound = {
      id: `spotify:${track.id}`,
      title: track.name,
      artist: track.artist,
      duration: track.duration,
      url: track.previewUrl,
      category: "Chill",
      source: "spotify",
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };
    handleSelectSound(asSound);
  }

  function SoundCard({
    sound,
    onDelete,
  }: {
    sound: Sound;
    onDelete?: () => void;
  }) {
    const isSelected = selected?.id === sound.id;
    const isPreviewing = previewingId === sound.id;
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
          isSelected ? "border-clay bg-clay/10" : "border-bg4 bg-bg2"
        }`}
      >
        <button
          type="button"
          onClick={() => togglePreview(sound.id, sound.url)}
          aria-label={isPreviewing ? "Pause preview" : "Play preview"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-bg3 text-xl"
        >
          {isPreviewing ? <Pause className="h-4 w-4 text-clay2" /> : <Music className="h-4 w-4 text-muted" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-syne text-sm font-semibold text-text">{sound.title}</p>
          <p className="truncate font-noto text-xs text-muted">
            {sound.artist} · {formatDuration(sound.duration)}
            {sound.source === "library" && ` · Used in ${sound.usageCount.toLocaleString()} posts`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => togglePreview(sound.id, sound.url)}
            aria-label={isPreviewing ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-clay2"
          >
            {isPreviewing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete sound"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-clay/10 hover:text-clay2"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSelectSound(sound)}
            className={isSelected ? "btn-ghost px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
          >
            {isSelected ? (
              <>
                <Check className="h-3.5 w-3.5" /> Selected
              </>
            ) : (
              "Select"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Sound">
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
            {(
              [
                { value: "library", label: "Library" },
                { value: "mySounds", label: "My Sounds" },
                { value: "spotify", label: "Spotify" },
              ] as { value: PickerTab; label: string }[]
            ).map((t) => (
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

        <div>
          {tab === "library" && (
            <div className="flex flex-col gap-3">
              {selected && (
                <button
                  type="button"
                  onClick={handleClearSound}
                  className="flex items-center gap-1.5 self-start rounded-full border border-clay/40 bg-clay/5 px-3 py-1 font-noto text-xs text-clay2 hover:bg-clay/10"
                >
                  <X className="h-3 w-3" /> Clear sound
                </button>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  placeholder="Search title or artist..."
                  className="input-base pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                      category === c
                        ? "border-clay bg-clay/15 text-clay2"
                        : "border-muted2 bg-bg3 text-muted hover:border-clay"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {libraryLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                </div>
              ) : librarySounds.length === 0 ? (
                <p className="py-8 text-center font-noto text-sm text-muted">No sounds found.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {librarySounds.map((s) => (
                    <SoundCard key={s.id} sound={s} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "mySounds" && (
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
                    <Upload className="h-4 w-4" /> Upload sound (MP3/WAV/OGG, under 5MB)
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
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
                    Sounds you upload here are private to you and appear only when you attach them
                    to a post.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {mySounds.map((s) => (
                    <SoundCard key={s.id} sound={s} onDelete={() => handleDeleteSound(s)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "spotify" && (
            <div className="flex flex-col gap-3">
              {!spotifyConnected ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green/15 text-2xl">
                    🎧
                  </span>
                  <p className="font-syne text-sm font-semibold text-text">
                    Connect Spotify to search tracks
                  </p>
                  <button type="button" onClick={handleConnectSpotify} className="btn-primary text-sm">
                    Connect Spotify
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSpotifySearch} className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      value={spotifyQuery}
                      onChange={(e) => setSpotifyQuery(e.target.value)}
                      placeholder="Search Spotify tracks..."
                      className="input-base pl-9"
                    />
                  </form>

                  <p className="rounded-lg border border-dashed border-muted2 bg-bg3 p-2.5 font-noto text-[11px] text-muted">
                    30-second preview via Spotify. Full track requires Spotify.
                  </p>

                  {spotifySearching ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted" />
                    </div>
                  ) : spotifyError ? (
                    <p className="py-8 text-center font-noto text-sm text-clay2">{spotifyError}</p>
                  ) : spotifyResults.length === 0 ? (
                    <p className="py-8 text-center font-noto text-sm text-muted">
                      Search for a track to preview it here.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {spotifyResults.map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg2 p-3"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg3">
                            {track.albumArt ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
            loading="lazy" src={track.albumArt} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Music className="h-4 w-4 text-muted" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-syne text-sm font-semibold text-text">
                              {track.name}
                            </p>
                            <p className="truncate font-noto text-xs text-muted">
                              {track.artist} · {formatDuration(track.duration)}
                              {!track.previewUrl && " · No preview"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectSpotifyTrack(track)}
                            disabled={!track.previewUrl}
                            className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40"
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
