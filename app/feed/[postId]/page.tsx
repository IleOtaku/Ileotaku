import type { Metadata } from "next";
import { getPost } from "@/lib/creatorFeed";
import SinglePostClient from "@/components/feed/SinglePostClient";

interface SinglePostPageProps {
  params: { postId: string };
}

export async function generateMetadata({ params }: SinglePostPageProps): Promise<Metadata> {
  const post = await getPost(params.postId);
  return { title: post ? `${post.displayName} on ÍléOtaku` : "Post" };
}

/** Shared-link landing page for one feed post — https://ileotaku.vercel.app/feed/[postId], per
 * the TikTok Feed Overhaul spec's share-sheet Copy Link/native-share URL. Renders the exact same
 * full-viewport TikTokFeedItem the main feed does, just as a single slide with a way back to the
 * full feed instead of a snap-scroll stack. */
export default function SinglePostPage({ params }: SinglePostPageProps) {
  return <SinglePostClient postId={params.postId} />;
}
