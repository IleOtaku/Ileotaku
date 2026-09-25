import type { Metadata } from "next";
import ProseDetailClient from "@/components/reader/ProseDetailClient";
import { getPublishedSeries } from "@/lib/publishedSeries";

interface StoryPageProps {
  params: { workId: string };
}

export async function generateMetadata({ params }: StoryPageProps): Promise<Metadata> {
  const series = await getPublishedSeries(params.workId).catch(() => null);
  return { title: series?.title ?? "Prose Story" };
}

/** Prose work details/landing page — the reader itself lives at /story/[workId]/read/[chapterId]. */
export default function StoryPage({ params }: StoryPageProps) {
  return <ProseDetailClient workId={params.workId} />;
}
