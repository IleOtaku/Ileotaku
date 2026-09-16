"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ExternalLink, Loader2, Lock, Search, Trash2, Upload } from "lucide-react";
import { Modal, Toggle } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { uploadImageWithProgress } from "@/lib/cloudinary";
import { addUploadedWallpaper, removeUploadedWallpaper, setConversationWallpaper, setConversationWallpaperBlur } from "@/lib/dms";
import { getUserProfile } from "@/lib/firestore";

export interface WallpaperPickerProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  currentBlur: boolean;
}

const SOLID_COLORS = [
  "#c4622d", "#d4a843", "#3d6b4f", "#9ecfef", "#7c3aed", "#a855f7", "#3b82f6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#6366f1", "#8b5cf6",
  "#1c1917", "#292524", "#e7e5e4", "#ffffff",
];

const GRADIENTS = [
  "linear-gradient(135deg,#c4622d,#d4a843)", "linear-gradient(135deg,#3d6b4f,#22c55e)",
  "linear-gradient(135deg,#9ecfef,#3b82f6)", "linear-gradient(135deg,#7c3aed,#a855f7)",
  "linear-gradient(135deg,#ec4899,#f43f5e)", "linear-gradient(135deg,#c4622d,#7c3aed)",
  "linear-gradient(135deg,#d4a843,#ef4444)", "linear-gradient(135deg,#3d6b4f,#9ecfef)",
  "linear-gradient(135deg,#6366f1,#8b5cf6)", "linear-gradient(135deg,#14b8a6,#3b82f6)",
  "linear-gradient(135deg,#f97316,#eab308)", "linear-gradient(135deg,#d946ef,#7c3aed)",
  "linear-gradient(135deg,#84cc16,#22c55e)", "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#c4622d,#3d6b4f)",
];

type Tab = "colors" | "gradients" | "uploads" | "pinterest";

/** DM Feature Overhaul (Part B): every participant sees the SAME wallpaper (saved on the
 * conversation itself, picked up in real time by everyone's onSnapshot listener) — only a
 * Platinum member can actually change it. The Pinterest tab is a link-out to Pinterest's own
 * search plus a "paste an image URL you found there" field, not a live embedded search: Pinterest
 * doesn't offer a public API for querying images from a third-party app without an approved
 * developer/business integration, so a real in-app search grid isn't something this can honestly
 * build — this is the closest functional equivalent. */
export default function WallpaperPicker({ open, onClose, conversationId, currentBlur }: WallpaperPickerProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>("colors");
  const [blur, setBlur] = useState(currentBlur);
  const [customHex, setCustomHex] = useState("#1a1510");
  const [gradientStart, setGradientStart] = useState("#c4622d");
  const [gradientEnd, setGradientEnd] = useState("#1a1510");
  const [pinterestQuery, setPinterestQuery] = useState("");
  const [pinterestUrl, setPinterestUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPlatinum = profile?.isPlatinum === true;

  async function apply(wallpaperUrl: string, wallpaperType: "color" | "gradient" | "image") {
    if (!user) return;
    setSaving(true);
    try {
      await setConversationWallpaper(conversationId, { wallpaperUrl, wallpaperType, wallpaperBlur: blur, setBy: user.uid });
      toast.success("Wallpaper updated for everyone in this chat.");
      onClose();
    } catch {
      toast.error("Couldn't set the wallpaper.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadProgress(0);
    try {
      const { secureUrl } = await uploadImageWithProgress(file, `wallpapers/${user.uid}`, setUploadProgress);
      await addUploadedWallpaper(user.uid, secureUrl);
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Uploaded! Tap it below to use it.");
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteUpload(url: string) {
    if (!user) return;
    await removeUploadedWallpaper(user.uid, url);
    const fresh = await getUserProfile(user.uid);
    useAuth.getState().setProfile(fresh);
  }

  const uploads = profile?.uploadedWallpapers ?? [];

  // Beta feedback bug: "The blur wallpaper toggle doesn't work" — persists the instant it's
  // flipped, rather than only ever being saved as a side effect of picking a whole new
  // wallpaper (see setConversationWallpaperBlur's own doc comment).
  async function handleToggleBlur(value: boolean) {
    setBlur(value);
    try {
      await setConversationWallpaperBlur(conversationId, value);
    } catch {
      setBlur(!value);
      toast.error("Couldn't update the blur setting.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Chat Wallpaper" zIndex={140}>
      {!isPlatinum ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Lock className="h-8 w-8 text-muted" />
          <p className="font-noto text-sm text-muted">Custom wallpapers are a Platinum perk.</p>
          <Link href="/pricing" className="btn-plat">
            Upgrade to Platinum
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-1 rounded-full bg-bg3 p-1">
            {(["colors", "gradients", "uploads", "pinterest"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full py-1.5 font-syne text-[11px] font-semibold capitalize ${tab === t ? "bg-clay text-ivory" : "text-muted"}`}
              >
                {t === "uploads" ? "My Uploads" : t}
              </button>
            ))}
          </div>

          <Toggle checked={blur} onChange={handleToggleBlur} label="Blur wallpaper" />

          {tab === "colors" && (
            <>
              <div className="grid grid-cols-6 gap-2">
                {SOLID_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => apply(c, "color")}
                    disabled={saving}
                    aria-label={c}
                    className="h-9 w-9 rounded-lg border border-bg4 disabled:opacity-60"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent"
                />
                <button type="button" onClick={() => apply(customHex, "color")} disabled={saving} className="btn-primary flex-1 text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Custom Color"}
                </button>
              </div>
            </>
          )}

          {tab === "gradients" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => apply(g, "gradient")}
                    disabled={saving}
                    aria-label="Gradient swatch"
                    className="h-12 w-full rounded-lg border border-bg4 disabled:opacity-60"
                    style={{ background: g }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent" />
                <input type="color" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-bg4 bg-transparent" />
                <button
                  type="button"
                  onClick={() => apply(`linear-gradient(135deg,${gradientStart},${gradientEnd})`, "gradient")}
                  disabled={saving}
                  className="btn-primary flex-1 text-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Custom Gradient"}
                </button>
              </div>
            </>
          )}

          {tab === "uploads" && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProgress !== null}
                className="btn-ghost w-full text-sm"
              >
                {uploadProgress !== null ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Upload an image
                  </>
                )}
              </button>
              {uploads.length === 0 ? (
                <p className="py-6 text-center font-noto text-xs text-muted">No uploads yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {uploads.map((url) => (
                    <div key={url} className="group relative aspect-[9/16] overflow-hidden rounded-lg">
                      <button type="button" onClick={() => apply(url, "image")} disabled={saving} className="h-full w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUpload(url)}
                        aria-label="Delete wallpaper"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "pinterest" && (
            <div className="flex flex-col gap-3">
              <p className="font-noto text-xs text-muted">
                Pinterest doesn&apos;t offer public in-app search — browse on Pinterest, then paste
                the image link here.
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={pinterestQuery}
                  onChange={(e) => setPinterestQuery(e.target.value)}
                  placeholder="Search Pinterest for..."
                  className="input-base w-full pl-9"
                />
              </div>
              <a
                href={`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(pinterestQuery || "wallpaper")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost w-full text-sm"
              >
                <ExternalLink className="h-4 w-4" /> Open Pinterest search
              </a>
              <input
                value={pinterestUrl}
                onChange={(e) => setPinterestUrl(e.target.value)}
                placeholder="Paste image URL from Pinterest..."
                className="input-base w-full text-sm"
              />
              {pinterestUrl && (
                <div className="overflow-hidden rounded-lg border border-bg4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pinterestUrl} alt="" className="max-h-40 w-full object-cover" onError={() => toast.error("Couldn't load that image.")} />
                </div>
              )}
              <button
                type="button"
                onClick={() => apply(pinterestUrl.trim(), "image")}
                disabled={!pinterestUrl.trim() || saving}
                className="btn-primary w-full text-sm disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use this image"}
              </button>
              <p className="text-center font-noto text-[10px] text-muted">via Pinterest</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
