/**
 * Client-side Cloudinary upload helpers — replaces Firebase Storage (which this project's
 * Firebase plan has never actually had a bucket provisioned for, see lib/firebase.ts) as the
 * media host for every user-uploaded file: avatars, series cover art, feed images/videos, and
 * creator sound uploads.
 *
 * Uploads use an UNSIGNED upload preset (NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET), which is the only
 * way to upload directly from the browser without exposing the account's API secret — the preset
 * is configured in the Cloudinary dashboard (Settings → Upload → Upload presets) with "Unsigned"
 * mode and whatever folder/transformation restrictions the account owner wants to enforce
 * server-side-equivalent. Deletion, by contrast, requires a SIGNED request (an HMAC of the
 * request params using the API secret), so it can never happen from the client — see
 * deleteFile() below, which calls this app's own /api/cloudinary/delete route instead.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function assertConfigured(): void {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary isn't configured — set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and " +
        "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local (see the comment there for where to " +
        "find them in the Cloudinary dashboard)."
    );
  }
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

interface CloudinaryApiResponse {
  secure_url: string;
  public_id: string;
  error?: { message: string };
}

/** Uploads an image file to Cloudinary under `folder` via its unsigned-preset REST endpoint. */
export async function uploadImage(file: File, folder: string): Promise<CloudinaryUploadResult> {
  assertConfigured();
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET!);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as CloudinaryApiResponse;
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? "Image upload failed. Please try again.");
  }
  return { secureUrl: data.secure_url, publicId: data.public_id };
}

/**
 * Uploads a video file to Cloudinary under `folder`. Uses XMLHttpRequest rather than fetch
 * specifically because fetch has no upload-progress event — XHR's `upload.onprogress` is what
 * lets `onProgress` report real bytes-transferred percentages (video files are large enough,
 * and uploads slow enough, that this actually matters to a user watching a progress bar, unlike
 * the small image/audio uploads above).
 */
export function uploadVideo(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<CloudinaryUploadResult> {
  assertConfigured();
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET!);
    form.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: CloudinaryApiResponse;
      try {
        data = JSON.parse(xhr.responseText) as CloudinaryApiResponse;
      } catch {
        reject(new Error("Video upload failed. Please try again."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve({ secureUrl: data.secure_url, publicId: data.public_id });
      } else {
        reject(new Error(data.error?.message ?? "Video upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Video upload failed. Please try again."));

    xhr.send(form);
  });
}

/** Uploads an audio file to Cloudinary's `/raw/upload` endpoint under `folder` — Cloudinary has
 * no dedicated "audio" resource type; raw is the correct one for non-image/video files. */
export async function uploadAudio(file: File, folder: string): Promise<CloudinaryUploadResult> {
  assertConfigured();
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET!);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as CloudinaryApiResponse;
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? "Audio upload failed. Please try again.");
  }
  return { secureUrl: data.secure_url, publicId: data.public_id };
}

/** Deletes a Cloudinary asset by its public_id — always goes through this app's own
 * /api/cloudinary/delete route, which signs the request with the API secret server-side. The
 * secret must never reach the browser, so there is no client-side equivalent of this call.
 * `resourceType` must match whichever upload function created the asset (uploadImage → "image",
 * the default; uploadVideo → "video"; uploadAudio → "raw") — Cloudinary's destroy endpoint is
 * scoped by resource type in its URL and silently no-ops against the wrong one. */
export async function deleteFile(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image"
): Promise<void> {
  const res = await fetch("/api/cloudinary/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicId, resourceType }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data as { error?: string } | null)?.error ?? "Couldn't delete this file.");
  }
}

/**
 * Appends Cloudinary's on-the-fly transformation segment (`f_auto,q_auto[,w_WIDTH]`) into a
 * `secure_url`, right after the `/upload/` (or `/raw/upload/`) segment every Cloudinary delivery
 * URL has — this is how Cloudinary serves a re-encoded, resized, format-negotiated (WebP/AVIF
 * when the browser supports it) version of the SAME uploaded asset without a separate upload or
 * server-side image pipeline. Returns the url unchanged if it isn't a Cloudinary URL at all (so
 * callers can pass any image url through this defensively).
 */
export function getOptimizedImageUrl(url: string, width?: number, quality: number | "auto" = "auto"): string {
  if (!url || !url.includes("res.cloudinary.com")) return url;
  const marker = url.includes("/upload/") ? "/upload/" : url.includes("/raw/upload/") ? "/raw/upload/" : null;
  if (!marker) return url;

  const transforms = ["f_auto", `q_${quality}`];
  if (width) transforms.push(`w_${width}`);

  return url.replace(marker, `${marker}${transforms.join(",")}/`);
}

/** Cloudinary auto-generates a poster frame for any uploaded video at `so_auto` (a special
 * "smart" offset, distinct from a fixed timestamp) when the same public_id is requested through
 * the /image/upload delivery path instead of /video/upload — this swaps a video's own secure_url
 * into that thumbnail form. Returns the url unchanged if it isn't a Cloudinary video url. */
export function getVideoThumbnail(videoUrl: string): string {
  if (!videoUrl || !videoUrl.includes("res.cloudinary.com") || !videoUrl.includes("/upload/")) {
    return videoUrl;
  }
  return videoUrl.replace("/upload/", "/upload/so_auto/");
}
