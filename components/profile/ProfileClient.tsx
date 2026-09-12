"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { updateProfile } from "firebase/auth";
import { Camera, Crown, LogOut, Palette, Pencil } from "lucide-react";
import { getCoverGradient } from "@/lib/coverStyles";
import ReadingStatsCard from "@/components/profile/ReadingStatsCard";
import ProfileSidebar from "@/components/profile/ProfileSidebar";
import ProfileVisitorsSection from "@/components/profile/ProfileVisitorsSection";
import FollowListModal from "@/components/social/FollowListModal";
import NowPlayingCard from "@/components/spotify/NowPlayingCard";
import { Skeleton, Tabs } from "@/components/ui";

// Sprint 10 perf audit: this page's own First Load JS pulled in all five tab bodies plus both
// modals even though only one tab (and no modal) is ever visible on first paint — dynamically
// importing each, ssr:false, keeps them out of the initial bundle entirely until their tab is
// actually selected or their modal actually opened. This page is fully client-rendered already
// (it's the signed-in user's own profile), so ssr:false costs nothing.
const EditProfileModal = dynamic(() => import("@/components/profile/EditProfileModal"), { ssr: false });
const AchievementsTab = dynamic(() => import("@/components/profile/AchievementsTab"), { ssr: false });
const CoverStylePicker = dynamic(() => import("@/components/profile/CoverStylePicker"), { ssr: false });
const HistoryTab = dynamic(() => import("@/components/profile/HistoryTab"), { ssr: false });
const LibraryTab = dynamic(() => import("@/components/profile/LibraryTab"), { ssr: false });
const ProfilePostsTab = dynamic(() => import("@/components/profile/ProfilePostsTab"), { ssr: false });
const SettingsTab = dynamic(() => import("@/components/profile/SettingsTab"), { ssr: false });
import { checkAndAwardAchievements } from "@/lib/achievements";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { getOptimizedImageUrl, uploadImage } from "@/lib/cloudinary";
import { getUserProfile, propagateProfileChange, upsertUserProfile } from "@/lib/firestore";
import { initials, stringToColor } from "@/lib/utils";

type ProfileTab = "library" | "history" | "achievements" | "posts" | "settings";

const TABS: { label: string; value: ProfileTab }[] = [
  { label: "Library", value: "library" },
  { label: "History", value: "history" },
  { label: "Achievements", value: "achievements" },
  { label: "Posts", value: "posts" },
  { label: "Settings", value: "settings" },
];

const VALID_TABS: ProfileTab[] = TABS.map((t) => t.value);

/** Client half of the profile page — needs metadata on the server, so app/profile/page.tsx wraps this. */
export default function ProfileClient() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ProfileTab>(() => {
    const tabParam = searchParams.get("tab") as ProfileTab | null;
    return tabParam && VALID_TABS.includes(tabParam) ? tabParam : "library";
  });
  const [editOpen, setEditOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const achievementsChecked = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  // Re-check achievement conditions once when the Achievements tab is opened — catches any
  // that unlocked from actions this session didn't already trigger a check for.
  useEffect(() => {
    if (tab === "achievements" && user && profile && !achievementsChecked.current) {
      achievementsChecked.current = true;
      checkAndAwardAchievements(user.uid, profile)
        .then((newlyUnlocked) => {
          if (newlyUnlocked.length > 0) {
            getUserProfile(user.uid).then((fresh) => useAuth.getState().setProfile(fresh));
          }
        })
        .catch(() => {
          // Non-fatal — the tab still renders correctly from the profile's existing
          // `achievements` array even if this re-check couldn't write anything new.
        });
    }
  }, [tab, user, profile]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const { secureUrl: photoURL } = await uploadImage(file, `avatars/${user.uid}`);

      // Optimistic update: reflect the new avatar in the UI (this page's <img> and the
      // Navbar's, both of which read profile.photoURL from this same Zustand store) the
      // instant the upload resolves, rather than waiting on the slower Firebase Auth +
      // Firestore round-trips below. profile is guaranteed non-null here — this page redirects
      // to /auth/login whenever there's no signed-in user, and every signed-in user has a
      // profile doc.
      useAuth.getState().setProfile(profile ? { ...profile, photoURL } : profile);

      await updateProfile(user, { photoURL });
      // upsertUserProfile (not updateUserPrefs) so this self-heals even in the edge case where
      // a signed-in user's Firestore profile doc is somehow missing — updateUserPrefs's plain
      // updateDoc would just throw in that case instead of creating it.
      await upsertUserProfile(user.uid, { photoURL });
      // Beta feedback: fan the new photo out to every already-published post/series that
      // denormalized the old one — same reasoning as EditProfileModal's display-name fan-out.
      propagateProfileChange(user.uid, { photoURL });
      await user.reload();
      useAuth.getState().setUser(auth.currentUser);
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Avatar updated!");
    } catch {
      toast.error("Couldn't update your avatar. Please try again.");
    } finally {
      setUploadingAvatar(false);
      // Reset so picking the SAME file again still fires onChange — without this, a second
      // attempt after a failed upload (or just re-testing) silently does nothing, since the
      // input's value string hasn't changed from the browser's point of view.
      input.value = "";
    }
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <div className="mt-6 flex items-center gap-4">
          <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-48 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.displayName ?? user.displayName ?? "Reader";
  // profile.photoURL (Firestore, via the Zustand store) rather than user.photoURL (Firebase
  // Auth) — the optimistic update in handleAvatarChange sets the former immediately on upload,
  // and a fresh setProfile() call always produces a new object reference, so this can never
  // read a stale, unchanged reference the way a mutated-in-place Firebase Auth User object
  // could. Falls back to user.photoURL for e.g. a Google sign-in whose photo hasn't been
  // copied into the Firestore profile yet.
  const avatarURL = profile?.photoURL ?? user.photoURL ?? undefined;
  const isPlatinum = profile?.isPlatinum === true;
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  const stats: { label: string; value: string; onClick?: () => void }[] = [
    { label: "Chapters Read", value: (profile?.chaptersRead ?? 0).toLocaleString() },
    { label: "Titles Tracked", value: (profile?.readingList?.length ?? 0).toLocaleString() },
    {
      label: "Followers",
      value: (profile?.followers?.length ?? 0).toLocaleString(),
      onClick: () => setFollowersOpen(true),
    },
    {
      label: "Following",
      value: (profile?.following?.length ?? 0).toLocaleString(),
      onClick: () => setFollowingOpen(true),
    },
    { label: "Day Streak", value: `${profile?.streakDays?.length ?? 0} 🔥` },
    { label: "Coins", value: (profile?.coins ?? 0).toLocaleString() },
    { label: "Member Since", value: joinDate || "—" },
  ];

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <div
        className="relative h-[200px] w-full overflow-hidden rounded-2xl"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(232,221,208,0.06) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(232,221,208,0.06) 1px, transparent 1px)",
            getCoverGradient(profile?.coverStyle),
          ].join(", "),
          backgroundSize: "24px 24px, 24px 24px, 100% 100%",
        }}
      >
        <div className="kente-bar absolute inset-x-0 top-0" />
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCoverPickerOpen(true)}
            aria-label="Change cover"
            className="btn-ghost bg-bg/40 text-xs backdrop-blur"
          >
            <Palette className="h-3.5 w-3.5" /> Cover
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="btn-ghost bg-bg/40 text-xs backdrop-blur"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </button>
        </div>
      </div>

      <div className="relative z-10 -mt-12 flex flex-col gap-4 px-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-4">
          <div className="relative h-24 w-24 shrink-0">
            {avatarURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
            loading="lazy"
                src={getOptimizedImageUrl(avatarURL, 96)}
                alt={displayName}
                className="h-24 w-24 rounded-full border-4 border-bg object-cover"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-bg font-cinzel text-2xl font-bold text-ivory"
                style={{ backgroundColor: stringToColor(displayName) }}
              >
                {initials(displayName)}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Upload avatar"
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-clay text-ivory ring-2 ring-bg transition-colors hover:bg-clay2"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          <div className="pb-1">
            <div className="flex items-center gap-2">
              <h1 className="font-cinzel text-xl text-text sm:text-2xl">{displayName}</h1>
              {isPlatinum ? (
                <span className="badge-plat">Platinum</span>
              ) : (
                <span className="badge-free">Free</span>
              )}
            </div>
            {profile?.handle && <p className="font-noto text-sm text-muted">@{profile.handle}</p>}
            {isPlatinum && profile?.platinumTagline && (
              <p className="mt-0.5 font-noto text-xs font-semibold text-plat2">{profile.platinumTagline}</p>
            )}
            {profile?.bio && <p className="mt-1 max-w-md font-noto text-xs text-muted">{profile.bio}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-1">
          <button type="button" onClick={() => setEditOpen(true)} className="btn-ghost text-sm">
            <Pencil className="h-4 w-4" /> Edit Profile
          </button>
          {!isPlatinum && (
            <a href="/pricing" className="btn-plat text-sm">
              <Crown className="h-4 w-4" /> Go Platinum
            </a>
          )}
          <button type="button" onClick={() => logout()} className="btn-ghost text-sm">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </div>

      {profile?.spotifyConnected && profile.showNowPlaying !== false && (
        <div className="mt-6">
          <NowPlayingCard uid={user.uid} />
        </div>
      )}

      <div className="mt-6">
        <ReadingStatsCard uid={user.uid} profile={profile} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 border-y border-bg4 py-6 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) =>
          s.onClick ? (
            <button key={s.label} type="button" onClick={s.onClick} className="text-center">
              <p className="font-cinzel text-lg text-gold sm:text-xl">{s.value}</p>
              <p className="font-noto text-xs text-muted hover:text-gold hover:underline">{s.label}</p>
            </button>
          ) : (
            <div key={s.label} className="text-center">
              <p className="font-cinzel text-lg text-gold sm:text-xl">{s.value}</p>
              <p className="font-noto text-xs text-muted">{s.label}</p>
            </div>
          )
        )}
      </div>

      <ProfileVisitorsSection />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_280px]">
        <div>
          <Tabs tabs={TABS} value={tab} onChange={(v) => setTab(v as ProfileTab)} />
          <div className="mt-8">
            {tab === "library" && <LibraryTab />}
            {tab === "history" && <HistoryTab />}
            {tab === "achievements" && <AchievementsTab />}
            {tab === "posts" && <ProfilePostsTab />}
            {tab === "settings" && <SettingsTab />}
          </div>
        </div>

        <ProfileSidebar profile={profile} />
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
      <CoverStylePicker open={coverPickerOpen} onClose={() => setCoverPickerOpen(false)} />
      <FollowListModal
        open={followersOpen}
        onClose={() => setFollowersOpen(false)}
        title="Followers"
        uid={user.uid}
        mode="followers"
      />
      <FollowListModal
        open={followingOpen}
        onClose={() => setFollowingOpen(false)}
        title="Following"
        uid={user.uid}
        mode="following"
      />
    </div>
  );
}
