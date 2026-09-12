import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Calendar, Sparkles, Users2 } from "lucide-react";
import BlockButton from "@/components/social/BlockButton";
import BlockedContentGate from "@/components/social/BlockedContentGate";
import CurrentlyReadingCard from "@/components/social/CurrentlyReadingCard";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/social/MessageButton";
import ProfileVisitRecorder from "@/components/social/ProfileVisitRecorder";
import ReportButton from "@/components/social/ReportButton";
import NowPlayingCard from "@/components/spotify/NowPlayingCard";
import { getCoverGradient } from "@/lib/coverStyles";
import AvatarLightbox from "@/components/ui/AvatarLightbox";
import { PlatinumBadge, VerifiedBadge } from "@/components/ui/Badges";
import { getUserProfile } from "@/lib/firestore";
import type { UserProfile } from "@/types";

interface PublicProfilePageProps {
  params: { uid: string };
}

/** Same defensive pattern as /creator/[handle]: a read failure (rules not deployed, a
 * transient outage) degrades to not-found rather than crashing this public page. */
async function safeGetUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    return await getUserProfile(uid);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const profile = await safeGetUserProfile(params.uid);
  return { title: profile ? profile.displayName : "Profile" };
}

/** Public profile for a non-creator reader — found via search or a Follow list. Creator
 * accounts have a richer page at /creator/[handle]; this covers everyone else. */
export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const profile = await safeGetUserProfile(params.uid);
  if (!profile) {
    notFound();
  }

  const followerCount = profile.followers?.length ?? 0;
  const followingCount = profile.following?.length ?? 0;
  const joined = new Date(profile.createdAt);
  const joinedLabel = Number.isNaN(joined.getTime())
    ? "—"
    : joined.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <BlockedContentGate targetUid={profile.uid} targetLabel={profile.handle ?? profile.displayName}>
    <ProfileVisitRecorder profileUid={profile.uid} />
    <div className="relative">
      <div
        className="relative h-40 w-full overflow-hidden bg-bg2 sm:h-48"
        style={{ backgroundImage: getCoverGradient(profile.coverStyle) }}
      >
        <div className="kente-bar absolute inset-x-0 top-0" />
      </div>

      <div className="relative z-10 mx-auto -mt-12 max-w-3xl px-4 pb-16 sm:px-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        <AvatarLightbox
          uid={profile.uid}
          photoURL={profile.photoURL}
          displayName={profile.displayName}
          size={80}
          className="border-4 border-bg font-cinzel text-2xl"
        />

        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="font-cinzel text-2xl text-text">{profile.displayName}</h1>
            <VerifiedBadge profile={profile} className="h-5 w-5" />
            <PlatinumBadge isPlatinum={profile.isPlatinum} className="h-5 w-5" />
            {profile.isPlatinum && <span className="badge-plat">Platinum</span>}
          </div>
          {profile.handle && <p className="font-noto text-sm text-muted">@{profile.handle}</p>}
          {profile.isPlatinum && profile.platinumTagline && (
            <p className="mt-0.5 font-noto text-xs font-semibold text-plat2">{profile.platinumTagline}</p>
          )}
          {profile.foundingCreator && (
            <span className="badge-plat mt-2 inline-flex">
              <Sparkles className="h-3 w-3" /> Founding Creator
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <FollowButton targetUid={profile.uid} initialFollowerCount={followerCount} hideCount />
          <MessageButton targetUid={profile.uid} />
          <ReportButton targetType="user" targetId={profile.uid} targetUserId={profile.uid} compact />
          <BlockButton targetUid={profile.uid} targetLabel={profile.handle ?? profile.displayName} compact />
        </div>
      </div>

      {profile.bio && (
        <p className="mt-6 max-w-2xl text-center font-noto text-sm text-muted sm:text-left">
          {profile.bio}
        </p>
      )}

      <div className="mt-6">
        <CurrentlyReadingCard target={profile} />
      </div>

      {profile.spotifyConnected && profile.showNowPlaying !== false && (
        <div className="mt-6">
          <NowPlayingCard uid={profile.uid} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-3 gap-4 border-y border-bg4 py-6 text-center sm:grid-cols-5">
        <div>
          <p className="font-cinzel text-lg text-text">{(profile.chaptersRead ?? 0).toLocaleString()}</p>
          <p className="font-noto text-xs text-muted">Chapters Read</p>
        </div>
        <div>
          <p className="font-cinzel text-lg text-text">{followerCount.toLocaleString()}</p>
          <p className="font-noto text-xs text-muted">Followers</p>
        </div>
        <div>
          <p className="font-cinzel text-lg text-text">{followingCount.toLocaleString()}</p>
          <p className="font-noto text-xs text-muted">Following</p>
        </div>
        <div>
          <p className="font-cinzel text-lg text-text">{(profile.readingList?.length ?? 0).toLocaleString()}</p>
          <p className="font-noto text-xs text-muted">Titles Tracked</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 font-cinzel text-lg text-text">
            <Calendar className="h-4 w-4 text-gold" />
          </p>
          <p className="font-noto text-xs text-muted">Joined {joinedLabel}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 font-noto text-xs text-muted sm:justify-start">
        <Users2 className="h-4 w-4" />
        {profile.isCreator
          ? "This reader is also a published creator — see their series on their creator page."
          : "A reader on ÍléOtaku."}
      </div>
      </div>
    </div>
    </BlockedContentGate>
  );
}
