import type { Metadata } from "next";
import HashtagFeedClient from "@/components/feed/HashtagFeedClient";

export function generateMetadata({ params }: { params: { tag: string } }): Metadata {
  return { title: `#${params.tag}` };
}

export default function HashtagFeedPage({ params }: { params: { tag: string } }) {
  return <HashtagFeedClient tag={decodeURIComponent(params.tag).toLowerCase()} />;
}
