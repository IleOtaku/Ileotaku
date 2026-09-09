import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side leg of Spotify's Authorization Code flow — exchanges the one-time `code` the
 * OAuth callback page received for real access/refresh tokens. This is the only place
 * SPOTIFY_CLIENT_SECRET is used for the user-authorization flow (mirrors the existing
 * app/api/spotify/search/route.ts's Client Credentials flow, which never needed a per-user
 * token at all) — it must never reach the browser.
 */
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function POST(request: NextRequest) {
  let body: { code?: string; redirectUri?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400, headers: noStore });
  }

  const { code, redirectUri } = body;
  if (!code || !redirectUri) {
    return NextResponse.json({ message: "Missing code or redirectUri." }, { status: 400, headers: noStore });
  }

  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { message: "Spotify isn't configured — add NEXT_PUBLIC_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.local." },
      { status: 501, headers: noStore }
    );
  }

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { message: `Spotify token exchange failed (${res.status}).`, detail: detail.slice(0, 300) },
        { status: 502, headers: noStore }
      );
    }

    const data = (await res.json()) as SpotifyTokenResponse;
    return NextResponse.json(
      { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in },
      { headers: noStore }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Spotify token exchange failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: noStore }
    );
  }
}
