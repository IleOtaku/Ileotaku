import { NextResponse, type NextRequest } from "next/server";

/** Server-side token refresh — swaps a stored refresh_token for a fresh access_token once the
 * current one is close to expiring. Same client-secret-never-reaches-the-browser reasoning as
 * app/api/spotify/token/route.ts. */
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

interface SpotifyRefreshResponse {
  access_token: string;
  expires_in: number;
  /** Spotify sometimes rotates the refresh token too; when it doesn't, the caller keeps using
   * the one it already has. */
  refresh_token?: string;
}

export async function POST(request: NextRequest) {
  let body: { refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400, headers: noStore });
  }

  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return NextResponse.json({ message: "Missing refresh_token." }, { status: 400, headers: noStore });
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
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { message: `Spotify token refresh failed (${res.status}).`, detail: detail.slice(0, 300) },
        { status: 502, headers: noStore }
      );
    }

    const data = (await res.json()) as SpotifyRefreshResponse;
    return NextResponse.json(
      {
        access_token: data.access_token,
        expires_in: data.expires_in,
        ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      },
      { headers: noStore }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Spotify token refresh failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: noStore }
    );
  }
}
