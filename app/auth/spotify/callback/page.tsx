import type { Metadata } from "next";
import { Suspense } from "react";
import SpotifyCallbackClient from "@/components/spotify/SpotifyCallbackClient";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Connecting Spotify",
};

export default function SpotifyCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SpotifyCallbackClient />
    </Suspense>
  );
}
