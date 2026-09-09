import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Deletes a Cloudinary asset by public_id. This has to live server-side: Cloudinary's destroy
 * API requires a SIGNED request (an HMAC-SHA1 of the request's params, using the account's API
 * secret), and that secret must never reach the browser — see lib/cloudinary.ts's deleteFile(),
 * the only caller, which never talks to Cloudinary directly for this reason (unlike the unsigned
 * uploads, which are safe to fire straight from the client with just an upload-preset name).
 *
 * Cloudinary's own signing scheme is a plain SHA1 (not HMAC) of `param1=value1&param2=value2...
 * {api_secret}` — every param except `file`/`api_key`/`signature`/`resource_type`, sorted
 * alphabetically, joined with `&`, with the secret appended directly (not used as an HMAC key).
 * Here that's just `public_id` and `timestamp`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary isn't configured on the server." }, { status: 500 });
  }

  let publicId: string | undefined;
  let resourceType: "image" | "video" | "raw" = "image";
  try {
    const body = (await request.json()) as { publicId?: string; resourceType?: "image" | "video" | "raw" };
    publicId = body.publicId;
    if (body.resourceType) resourceType = body.resourceType;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!publicId) {
    return NextResponse.json({ error: "Missing publicId." }, { status: 400 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);

  try {
    // Cloudinary's destroy endpoint is scoped by resource type in the URL path itself — hitting
    // /image/destroy for a video or raw (audio) public_id reports "not found" rather than
    // deleting anything, so this has to match whichever /{type}/upload endpoint the asset was
    // originally uploaded through (see lib/cloudinary.ts's uploadImage/uploadVideo/uploadAudio).
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { result?: string };
    // Cloudinary reports "ok" on success and "not found" when the asset is already gone — both
    // are a successful outcome from this route's point of view (the caller wanted it gone).
    if (res.ok && (data.result === "ok" || data.result === "not found")) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: data.result ?? "Delete failed." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Delete request failed." }, { status: 502 });
  }
}
