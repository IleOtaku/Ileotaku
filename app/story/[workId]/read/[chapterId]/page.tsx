import type { Metadata } from "next";
import ProseReaderClient from "@/components/reader/ProseReaderClient";
import { getPublishedSeries } from "@/lib/publishedSeries";

interface StoryReaderPageProps {
  params: { workId: string; chapterId: string };
}

export async function generateMetadata({ params }: StoryReaderPageProps): Promise<Metadata> {
  const series = await getPublishedSeries(params.workId).catch(() => null);
  return { title: series?.title ?? "Prose Story" };
}

export default function StoryReaderPage({ params }: StoryReaderPageProps) {
  const chapterNumber = Number(params.chapterId);
  return (
    <ProseReaderClient
      workId={params.workId}
      initialChapterNumber={Number.isInteger(chapterNumber) && chapterNumber > 0 ? chapterNumber : undefined}
    />
  );
}
