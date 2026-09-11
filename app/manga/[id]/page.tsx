import type { Metadata } from "next";
import MangaDetailClient from "@/components/manga/MangaDetailClient";
import { getMangaDetail } from "@/lib/manga-api";

interface MangaPageProps {
  params: { id: string };
  searchParams: { from?: string };
}

// generateMetadata always runs server-side and reads straight from Firestore (see
// lib/publishedSeries.ts) — the worst case if that lookup ever fails is a generic <title> tag,
// caught below, rather than a broken page.
export async function generateMetadata({ params }: MangaPageProps): Promise<Metadata> {
  try {
    const res = await getMangaDetail(params.id);
    return { title: res.data.title };
  } catch {
    return { title: "Manga" };
  }
}

export default function MangaPage({ params, searchParams }: MangaPageProps) {
  return <MangaDetailClient id={params.id} from={searchParams.from} />;
}
