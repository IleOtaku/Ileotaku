"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Modal, Select } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getUserProfile, updateUserPrefs } from "@/lib/firestore";
import { GENRES } from "@/lib/utils";

export interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

/** Edit Profile modal: display name, handle, bio, favourite genre — saves straight to Firestore. */
export default function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { user, profile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [favoriteGenre, setFavoriteGenre] = useState(GENRES[0]);
  const [twitter, setTwitter] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);

  // Resync the form to the latest profile every time the modal opens.
  useEffect(() => {
    if (open) {
      setDisplayName(profile?.displayName ?? "");
      setHandle(profile?.handle ?? "");
      setBio(profile?.bio ?? "");
      setFavoriteGenre(profile?.favoriteGenre ?? GENRES[0]);
      setTwitter(profile?.socialLinks?.twitter ?? "");
      setInstagram(profile?.socialLinks?.instagram ?? "");
      setWebsite(profile?.socialLinks?.website ?? "");
    }
  }, [open, profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateUserPrefs(user.uid, {
        displayName: displayName.trim(),
        handle: handle.trim().replace(/^@/, ""),
        bio: bio.trim(),
        favoriteGenre,
        socialLinks: {
          ...(twitter.trim() ? { twitter: twitter.trim().replace(/^@/, "") } : {}),
          ...(instagram.trim() ? { instagram: instagram.trim().replace(/^@/, "") } : {}),
          ...(website.trim() ? { website: website.trim() } : {}),
        },
      });
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Profile updated!");
      onClose();
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Profile">
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Display name
          </label>
          <input
            className="input-base"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Handle</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-noto text-sm text-muted">
              @
            </span>
            <input
              className="input-base pl-7"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Bio</label>
          <textarea
            className="input-base min-h-20 resize-none"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell other readers about yourself"
          />
        </div>

        <Select
          label="Favorite genre"
          value={favoriteGenre}
          onChange={(e) => setFavoriteGenre(e.target.value)}
          options={GENRES.map((g) => ({ label: g, value: g }))}
        />

        <div className="border-t border-bg4 pt-4">
          <p className="mb-3 font-syne text-xs font-semibold text-muted">Social Links</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Twitter / X handle
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-noto text-sm text-muted">
                  @
                </span>
                <input
                  className="input-base pl-7"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="yourhandle"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Instagram handle
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-noto text-sm text-muted">
                  @
                </span>
                <input
                  className="input-base pl-7"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="yourhandle"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Website</label>
              <input
                type="url"
                className="input-base"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yoursite.com"
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary mt-2 w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
      </form>
    </Modal>
  );
}
