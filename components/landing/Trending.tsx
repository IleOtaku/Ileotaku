import Link from "next/link";
import { SectionEyebrow } from "@/components/ui";
import { getMangaList, proxyImg } from "@/lib/manga-api";
import Reveal from "./Reveal";

/** Server component: fetches the live trending list from MangaHook and renders a ranked grid. */
export default async function Trending() {
  let items: { id: string; title: string; image: string; chapter?: string }[] = [];

  try {
    const res = await getMangaList(1);
    items = res.data.mangaList.slice(0, 6);
  } catch {
    items = [];
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <Reveal>
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <SectionEyebrow>Trending Now</SectionEyebrow>
            <h2 className="font-cinzel text-2xl text-text sm:text-3xl">
              What everyone&apos;s reading
            </h2>
          </div>
          <Link
            href="/explore"
            className="hidden font-syne text-sm text-gold hover:underline sm:block"
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item, i) => (
            <Link
              key={item.id}
              href={`/manga/${encodeURIComponent(item.id)}`}
              className="group relative overflow-hidden rounded-xl border border-bg4 bg-bg2 transition-transform hover:-translate-y-1"
            >
              <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-clay font-syne text-xs font-bold text-ivory">
                {i + 1}
              </span>
              <div className="aspect-[3/4] w-full overflow-hidden bg-bg3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyImg(item.image)}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5">
                <p className="truncate font-syne text-xs font-semibold text-text">{item.title}</p>
                {item.chapter && (
                  <p className="mt-0.5 font-noto text-[11px] text-muted">{item.chapter}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
