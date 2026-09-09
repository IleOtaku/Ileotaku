import type { Metadata } from "next";
import { Suspense } from "react";
import FeedClient from "@/components/feed/FeedClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Creator Feed",
};

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <FeedClient />
    </Suspense>
  );
}
