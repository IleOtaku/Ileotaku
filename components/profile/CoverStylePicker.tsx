"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { Check, ImagePlus, Loader2, Palette, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage } from "@/lib/cloudinary";
import { getUserProfile, updateUserPrefs } from "@/lib/firestore";
import { COVER_STYLES } from "@/lib/coverStyles";
import type { CoverStyleId } from "@/types";

// The actual data/helpers live in lib/coverStyles.ts (plain, no "use client") — re-exported here
// for backward compatibility with anything still importing them from this path. See that
// file's own comment for why: a Server Component importing a plain function from a "use
// client" module throws under `next dev` (confirmed live), even though the function itself
// uses no client-only APIs.
export { COVER_GRADIENTS, COVER_STYLES, getCoverClassName, getCoverGradient, type CoverStyleOption } from "@/lib/coverStyles";

const ImageCropModal = dynamic(() => import("@/components/ui/ImageCropModal"), { ssr: false });

export interface CoverStylePickerProps {
  open: boolean;
  onClose: () => void;
}

/** Six-preset picker for the profile banner's background gradient — saves directly to
 * Firestore's `coverStyle` field on the user's profile. */
export default function CoverStylePicker({ open, onClose }: CoverStylePickerProps) {
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState<CoverStyleId | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hasPhoto = !!profile?.coverPhotoURL;
  // A photo overrides the gradient, so no preset reads as "selected" while one is set.
  const current = hasPhoto ? null : (profile?.coverStyle ?? "default");

  async function refresh() {
    if (!user) return;
    useAuth.getState().setProfile(await getUserProfile(user.uid));
  }

  async function handlePhotoConfirmed(cropped: File) {
    if (!user) return;
    setCropFile(null);
    setUploadingPhoto(true);
    try {
      const { secureUrl } = await uploadImage(cropped, `covers/${user.uid}`);
      if (!secureUrl) throw new Error("Upload returned no URL.");
      await updateUserPrefs(user.uid, { coverPhotoURL: secureUrl });
      await refresh();
      toast.success("Cover photo updated!");
      onClose();
    } catch {
      toast.error("Couldn't upload your cover photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    if (!user) return;
    setUploadingPhoto(true);
    try {
      await updateUserPrefs(user.uid, { coverPhotoURL: null });
      await refresh();
      toast.success("Cover photo removed.");
    } catch {
      toast.error("Couldn't remove your cover photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSelect(id: CoverStyleId) {
    if (!user || saving) return;
    setSaving(id);
    try {
      // Choosing a preset replaces any uploaded photo (the photo would otherwise hide the change).
      await updateUserPrefs(user.uid, { coverStyle: id, coverPhotoURL: null });
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Cover updated!");
      onClose();
    } catch {
      toast.error("Couldn't update your cover. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a Cover">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={uploadingPhoto}
          className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload cover photo
        </button>
        {hasPhoto && (
          <button type="button" onClick={handleRemovePhoto} disabled={uploadingPhoto} className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Remove photo
          </button>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && file.type.startsWith("image/")) setCropFile(file);
            else if (file) toast.error("Please choose an image file.");
          }}
        />
      </div>
      <ImageCropModal
        file={cropFile}
        aspect={3}
        outputWidth={1500}
        title="Crop cover photo"
        onCancel={() => setCropFile(null)}
        onConfirm={handlePhotoConfirmed}
      />
      <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Or pick a colour</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {COVER_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => handleSelect(style.id)}
            disabled={saving !== null}
            className={`relative h-16 overflow-hidden rounded-xl border-2 transition-colors ${style.className} ${
              current === style.id ? "border-gold" : "border-transparent hover:border-muted2"
            }`}
          >
            {current === style.id && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg/70">
                <Check className="h-3 w-3 text-gold" />
              </span>
            )}
            {saving === style.id && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-ivory" />
              </span>
            )}
            <span className="absolute bottom-1 left-2 font-syne text-[10px] font-semibold text-ivory drop-shadow">
              {style.label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 font-noto text-xs text-muted">
        <Palette className="h-3.5 w-3.5" /> Pick a preset to change your profile banner.
      </p>
    </Modal>
  );
}
