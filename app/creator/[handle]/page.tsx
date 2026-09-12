import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCoverGradient } from "@/lib/coverStyles";
import AvatarLightbox from "@/components/ui/AvatarLightbox";
import { PlatinumBadge, VerifiedBadge } from "@/components/ui/Badges";
import { getUserByHandle } from "@/lib/firestore";
import { getPostsByCreator } from "@/lib/creatorFeed";
import { getPublishedSeriesByAuthor } from "@/lib/publishedSeries";
import CreatorProfileTabs from "@/components/creator/CreatorProfileTabs";
import TipCreatorButton from "@/components/monetisation/TipCreatorButton";
import BlockButton from "@/components/social/BlockButton";
import BlockedContentGate from "@/components/social/BlockedContentGate";
import CurrentlyReadingCard from "@/components/social/CurrentlyReadingCard";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/social/MessageButton";
import ProfileVisitRecorder from "@/components/social/ProfileVisitRecorder";
import ReportButton from "@/components/social/ReportButton";
import NowPlayingCard from "@/components/spotify/NowPlayingCard";
import type { CreatorPost, PublishedSeries, UserProfile } from "@/types";

interface CreatorProfilePageProps {
  params: { handle: string };
}

/** Firestore reads can fail for reasons besides "not found" (rules not yet redeployed, a
 * transient outage, etc.) — never let that hard-crash a public page; treat it as not-found. */
async function safeGetUserByHandle(handle: string): Promise<UserProfile | null> {
  try {
    return await getUserByHandle(handle);
  } catch {
    return null;
  }
}

async function safeGetPublishedWorks(handle: string | undefined, uid: string): Promise<PublishedSeries[]> {
  try {
    return await getPublishedSeriesByAuthor({ handle, uid });
  } catch {
    return [];
  }
}

async function safeGetPosts(uid: string): Promise<CreatorPost[]> {
  try {
    return await getPostsByCreator(uid);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: CreatorProfilePageProps): Promise<Metadata> {
  const creator = await safeGetUserByHandle(params.handle);
  return {
    title: creator ? `${creator.displayName} (Creator)` : "Creator",
  };
}

/** Public creator profile: banner, avatar, badges, aggregate stats, and Posts/Works/About tabs. */
export default async function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const creator = await safeGetUserByHandle(params.handle);
  if (!creator) {
    notFound();
  }

  const [works, posts] = await Promise.all([
    safeGetPublishedWorks(creator.handle, creator.uid),
    safeGetPosts(creator.uid),
  ]);
  const totalReads = works.reduce((sum, w) => sum + w.totalReads, 0);
  const followerCount = creator.followers?.length ?? 0;
  // createdAt can be missing (or unparseable) on older/seed accounts — never surface the
  // literal "Invalid Date" string that Date().toLocaleDateString() produces in that case.
  const joinedDate = creator.createdAt ? new Date(creator.createdAt) : null;
  const joined =
    joinedDate && !Number.isNaN(joinedDate.getTime())
      ? joinedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "—";

  return (
    <BlockedContentGate targetUid={creator.uid} targetLabel={creator.handle ?? creator.displayName}>
    <ProfileVisitRecorder profileUid={creator.uid} />
    <div className="relative">
      <div
        className="relative h-48 w-full overflow-hidden bg-bg2 sm:h-64"
        style={{ backgroundImage: getCoverGradient(creator.coverStyle) }}
      >
        <div className="kente-bar absolute inset-x-0 top-0" />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="relative z-10 -mt-14 flex flex-col items-start gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <AvatarLightbox
              uid={creator.uid}
              photoURL={creator.photoURL}
              displayName={creator.displayName}
              size={80}
              className="border-4 border-bg font-cinzel text-2xl"
            />

            <div className="pb-2">
              <div className="flex items-center gap-2">
                <h1 className="font-cinzel text-2xl text-text">{creator.displayName}</h1>
                <VerifiedBadge profile={creator} className="h-5 w-5" />
                <PlatinumBadge isPlatinum={creator.isPlatinum} className="h-5 w-5" />
              </div>
              {creator.handle && <p className="font-noto text-sm text-muted">@{creator.handle}</p>}
              {creator.isPlatinum && creator.platinumTagline && (
                <p className="mt-0.5 font-noto text-xs font-semibold text-plat2">{creator.platinumTagline}</p>
              )}
              {creator.foundingCreator && (
                <span className="badge-plat mt-2 inline-flex">
                  <Sparkles className="h-3 w-3" /> Founding Creator
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FollowButton targetUid={creator.uid} initialFollowerCount={followerCount} />
            <MessageButton targetUid={creator.uid} />
            <TipCreatorButton
              creatorId={creator.uid}
              creatorName={creator.displayName}
              label="Send a Tip 🪙"
            />
            <ReportButton targetType="user" targetId={creator.uid} targetUserId={creator.uid} compact />
            <BlockButton targetUid={creator.uid} targetLabel={creator.handle ?? creator.displayName} compact />
          </div>
        </div>

        <div className="mt-6 max-w-md">
          <CurrentlyReadingCard target={creator} />
        </div>

        {creator.spotifyConnected && creator.showNowPlaying !== false && (
          <div className="mt-6 max-w-md">
            <NowPlayingCard uid={creator.uid} />
          </div>
        )}

        <CreatorProfileTabs
          creator={creator}
          works={works}
          posts={posts}
          totalReads={totalReads}
          followerCount={followerCount}
          joined={joined}
        />
      </div>
    </div>
    </BlockedContentGate>
  );
}
