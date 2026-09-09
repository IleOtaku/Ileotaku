import { Suspense } from "react";
import HomeClient from "@/components/home/HomeClient";
import Trending from "@/components/landing/Trending";
import { getAfricanOriginals } from "@/lib/publishedSeries";

function TrendingFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="skeleton h-8 w-48 rounded-lg" />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton aspect-[3/4] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const africanOriginals = await getAfricanOriginals(3);
  return (
    <HomeClient
      trendingSlot={
        <Suspense fallback={<TrendingFallback />}>
          <Trending />
        </Suspense>
      }
      africanOriginals={africanOriginals}
    />
  );
}
