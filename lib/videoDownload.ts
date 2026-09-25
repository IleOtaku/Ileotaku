/**
 * Downloads — and the ONLY place a watermark is ever applied.
 *
 * The watermark is stamped at DOWNLOAD time, via a Cloudinary text-overlay transformation baked
 * into the fetched URL — never touching the original upload, so what a creator posted stays the
 * clean file regardless of anyone's download. DM media never goes through this: use
 * `downloadMediaDirect` — private conversations stay private and unmarked.
 *
 * Beta feedback bug: "the whole watermark thing is ass.... doesnt work... the video doesnt save
 * as mp4 and it doesnt save anything, just an empty file of 0b." The previous approach re-recorded
 * the video client-side (canvas.captureStream + MediaRecorder), which silently produced zero
 * frames whenever the tab lost focus, the decode stalled, or `video.play()` didn't win the
 * browser's autoplay gate in time — a real browser-API fragility, not something worth continuing
 * to chase. A Cloudinary overlay transformation is stamped server-side: no canvas, no
 * MediaRecorder, works in a backgrounded tab, and comes back as a real MP4 in every browser.
 */

/** Triggers a browser save of `blob` under `filename`. */
function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a beat to start the save before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

/** Simple download with no processing — used for DM media and for feed posts whose creator turned the
 * watermark off. Fetches as a blob (Cloudinary URLs are cross-origin, and a browser only honours the
 * `download` attribute on same-origin resources); if the fetch itself is blocked it falls back to
 * opening the file so the person can still save it manually. */
export async function downloadMediaDirect(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    saveBlob(await response.blob(), filename);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Inserts a Cloudinary text-overlay transformation (the platform name, bottom-right, semi-
 * transparent gold) right after `/upload/` in a Cloudinary video URL. Any other host's URL is
 * returned unchanged — there's no server-side transform to apply to a file Cloudinary never
 * hosted (a voice note, a non-Cloudinary DM upload, ...), so those just download as-is. */
export function getWatermarkedVideoUrl(cloudinaryUrl: string): string {
  if (!cloudinaryUrl.includes("res.cloudinary.com") || !cloudinaryUrl.includes("/upload/")) return cloudinaryUrl;
  const watermarkText = encodeURIComponent("ILEOTAKU");
  const overlay = `l_text:Arial_32_bold:${watermarkText},co_rgb:d4a843,o_70,g_south_east,x_20,y_20`;
  return cloudinaryUrl.replace("/upload/", `/upload/${overlay}/`);
}

/** Downloads a feed video with the ÍléOtaku watermark stamped on it — see this file's own doc
 * comment for why this is a Cloudinary URL transform rather than client-side re-encoding. Rejects
 * (falling back to `downloadMediaDirect`, same as before) only when the source isn't a Cloudinary
 * URL at all, since there's no transform to apply in that case. */
export async function downloadWatermarkedVideo(videoUrl: string, filename: string): Promise<void> {
  const watermarked = getWatermarkedVideoUrl(videoUrl);
  if (watermarked === videoUrl) throw new Error("This video isn't hosted on Cloudinary — nothing to watermark.");
  const response = await fetch(watermarked);
  if (!response.ok) throw new Error(`Couldn't prepare the watermarked video (HTTP ${response.status}).`);
  saveBlob(await response.blob(), `${filename}_ileotaku.mp4`);
}
