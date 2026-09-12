"use client";

import { useState } from "react";
import { AtSign, Calendar, Eye, Globe, MapPin, Sparkles, Users2 } from "lucide-react";
import CreatorPostsViewer from "@/components/creator/CreatorPostsViewer";
import PostGridCard from "@/components/creator/PostGridCard";
import PublishedWorkCard from "@/components/creator/PublishedWorkCard";
import { EmptyState, Tabs } from "@/components/ui";
import type { CreatorPost, PublishedSeries, UserProfile } from "@/types";

type ProfileTab = "posts" | "works" | "about";

export interface CreatorProfileTabsProps {
  creator: UserProfile;
  works: PublishedSeries[];
  posts: CreatorPost[];
  totalReads: number;
  followerCount: number;
  joined: string;
}

/** Tab bar below a public creator profile's header: Posts (default) / Works / About. */
export default function CreatorProfileTabs({
  creator,
  works,
  posts,
  totalReads,
  followerCount,
  joined,
}: CreatorProfileTabsProps) {
  const [tab, setTab] = useState<ProfileTab>("posts");
  // Beta feedback: "The post section on user's profile should just be small cards... Tapping one
  // would open the post with a back arrow button top left."
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // `works` is already the creator's PUBLISHED catalog (queried from publishedSeries — pending
  // and rejected creatorWorks never reach this component at all), so no status filter is needed
  // here the way the old creatorWorks-backed version required.
  const published = works;
  const social = creator.socialLinks;

  return (
    <div className="mt-10">
      <Tabs
        tabs={[
          { label: "Posts", value: "posts" },
          { label: "Works", value: "works" },
          { label: "About", value: "about" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as ProfileTab)}
      />

      <div className="mt-6">
        {tab === "posts" &&
          (posts.length === 0 ? (
            <EmptyState
              title="No posts yet"
              description={`${creator.displayName} hasn't shared an update yet — check back soon.`}
            />
          ) : (
            <div className="mx-auto grid max-w-2xl grid-cols-3 gap-1.5 sm:gap-2">
              {posts.map((post, i) => (
                <PostGridCard key={post.id} post={post} onClick={() => setViewerIndex(i)} />
              ))}
            </div>
          ))}

        {tab === "works" &&
          (published.length === 0 ? (
            <EmptyState
              title="Nothing published yet"
              description="This creator hasn't released a series yet — check back soon."
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((work) => (
                <PublishedWorkCard key={work.id} work={work} />
              ))}
            </div>
          ))}

        {tab === "about" && (
          <div className="mx-auto flex max-w-xl flex-col gap-6">
            {creator.bio && <p className="font-noto text-sm leading-relaxed text-muted">{creator.bio}</p>}

            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-bg4 bg-bg2 p-5 sm:grid-cols-4">
              <div>
                <Eye className="h-4 w-4 text-gold" />
                <p className="mt-2 font-cinzel text-lg text-text">{totalReads.toLocaleString()}</p>
                <p className="font-noto text-xs text-muted">Total Reads</p>
              </div>
              <div>
                <Sparkles className="h-4 w-4 text-gold" />
                <p className="mt-2 font-cinzel text-lg text-text">{published.length}</p>
                <p className="font-noto text-xs text-muted">Works Published</p>
              </div>
              <div>
                <Users2 className="h-4 w-4 text-gold" />
                <p className="mt-2 font-cinzel text-lg text-text">{followerCount.toLocaleString()}</p>
                <p className="font-noto text-xs text-muted">Followers</p>
              </div>
              <div>
                <Calendar className="h-4 w-4 text-gold" />
                <p className="mt-2 font-cinzel text-lg text-text">{joined}</p>
                <p className="font-noto text-xs text-muted">Joined</p>
              </div>
            </div>

            {(creator.country || social?.twitter || social?.instagram || social?.website) && (
              <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
                {creator.country && (
                  <div className="flex items-center gap-2 font-noto text-sm text-text">
                    <MapPin className="h-4 w-4 text-muted" /> {creator.country}
                  </div>
                )}
                {social?.twitter && (
                  <a
                    href={`https://x.com/${social.twitter.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 font-noto text-sm text-text hover:text-gold"
                  >
                    <AtSign className="h-4 w-4 text-muted" /> {social.twitter.replace(/^@/, "")} on X
                  </a>
                )}
                {social?.instagram && (
                  <a
                    href={`https://instagram.com/${social.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 font-noto text-sm text-text hover:text-gold"
                  >
                    <AtSign className="h-4 w-4 text-muted" /> {social.instagram.replace(/^@/, "")} on Instagram
                  </a>
                )}
                {social?.website && (
                  <a
                    href={social.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 font-noto text-sm text-text hover:text-gold"
                  >
                    <Globe className="h-4 w-4 text-muted" /> {social.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {viewerIndex !== null && (
        <CreatorPostsViewer posts={posts} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}
