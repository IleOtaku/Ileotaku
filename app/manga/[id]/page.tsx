import type { Metadata } from "next";
import MangaDetailClient from "@/components/manga/MangaDetailClient";
import { getMangaDetail } from "@/lib/manga-api";

interface MangaPageProps {
  params: { id: string };
  searchParams: { from?: string };
}

// generateMetadata has no client-side equivalent — it always runs server-side, so this one call
// is still subject to whatever's blocking MangaDex/Comick/MangaHook requests from Vercel's IP
// ranges (see MangaDetailClient's own comment for the full story). That's an acceptable
// trade-off here: the worst case if it's blocked is a generic <title> tag, caught below, rather
// than a broken page — the actual content comes from MangaDetailClient's browser-side fetch,
// which isn't affected by the same block.
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
