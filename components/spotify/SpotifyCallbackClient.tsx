"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { saveSpotifyAuth } from "@/lib/spotify";
import { updateUserPrefs } from "@/lib/firestore";

type Status = "exchanging" | "error";

interface SpotifyMe {
  id: string;
  display_name?: string;
}

/**
 * Finishes the Authorization Code round trip: reads `code`/`state` (the signed-in uid, passed
 * through connectSpotify()'s `state` param — read from here rather than useAuth() so this
 * doesn't have to race Firebase Auth's own session restoration on a fresh page load), exchanges
 * the code server-side, fetches the Spotify account's own id/display name, and writes both the
 * OAuth grant and the profile's `spotifyConnected` mirror before redirecting to /profile.
 */
export default function SpotifyCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get("code");
    const uid = searchParams.get("state");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setStatus("error");
      setErrorMessage(
        oauthError === "access_denied"
          ? "You declined the Spotify connection request."
          : `Spotify returned an error: ${oauthError}`
      );
      return;
    }
    if (!code || !uid) {
      setStatus("error");
      setErrorMessage("This link is missing information Spotify should have sent back. Try connecting again.");
      return;
    }

    (async () => {
      try {
        const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
        if (!redirectUri) throw new Error("NEXT_PUBLIC_SPOTIFY_REDIRECT_URI is not set.");

        const tokenRes = await fetch("/api/spotify/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri }),
          cache: "no-store",
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          throw new Error(tokenData.message ?? "Spotify token exchange failed.");
        }

        const meRes = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          cache: "no-store",
        });
        const me: SpotifyMe = meRes.ok ? await meRes.json() : { id: "unknown" };

        await saveSpotifyAuth(uid, {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          spotifyUserId: me.id,
          spotifyDisplayName: me.display_name,
        });
        await updateUserPrefs(uid, { spotifyConnected: true });

        router.replace("/profile?tab=settings");
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Couldn't connect Spotify. Please try again.");
      }
    })();
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-clay/15 text-clay2">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="font-cinzel text-xl text-text">Couldn&apos;t connect Spotify</h1>
        <p className="font-noto text-sm text-muted">{errorMessage}</p>
        <Link href="/profile?tab=settings" className="btn-primary">
          Back to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      <p className="font-noto text-sm text-muted">Connecting your Spotify account...</p>
    </div>
  );
}
