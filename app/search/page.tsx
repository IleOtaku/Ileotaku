import type { Metadata } from "next";
import { Suspense } from "react";
import SearchClient from "@/components/search/SearchClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Search",
};

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SearchClient />
    </Suspense>
  );
}
