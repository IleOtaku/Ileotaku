import type { Metadata } from "next";
import ProseReaderClient from "@/components/reader/ProseReaderClient";
import { getPublishedSeries } from "@/lib/publishedSeries";

interface StoryPageProps {
  params: { workId: string };
}

export async function generateMetadata({ params }: StoryPageProps): Promise<Metadata> {
  const series = await getPublishedSeries(params.workId).catch(() => null);
  return { title: series?.title ?? "Prose Story" };
}

export default function StoryPage({ params }: StoryPageProps) {
  return <ProseReaderClient workId={params.workId} />;
}
