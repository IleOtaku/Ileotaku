/**
 * Downloads — and the ONLY place a watermark is ever applied.
 *
 * The watermark is stamped at DOWNLOAD time, in the downloader's browser. Uploads go to Cloudinary
 * untouched (VideoUploader no longer processes anything), so the original a creator posted is always
 * the clean file, and whether it gets marked is decided per download by the creator's "Add watermark to
 * downloads" setting. DM media never goes through this: use `downloadMediaDirect` — private
 * conversations stay private and unmarked.
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

export interface WatermarkProgress {
  (percent: number): void;
}

function pickRecorderFormat(): { mimeType: string; extension: string } {
  const candidates: [string, string][] = [
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
    ["video/mp4", "mp4"],
  ];
  const hit = candidates.find(([type]) => MediaRecorder.isTypeSupported(type));
  return { mimeType: hit?.[0] ?? "", extension: hit?.[1] ?? "webm" };
}

/** The watermark itself, drawn ONCE onto its own small canvas (pill + eye icon + name + @handle) and then
 * simply stamped onto every frame — measuring and painting text 30 times a second would be wasteful. */
function renderWatermark(eye: HTMLImageElement, videoWidth: number, videoHeight: number, handle: string): HTMLCanvasElement {
  const eyeSize = Math.max(28, Math.min(120, Math.min(videoWidth, videoHeight) * 0.085));
  const pad = eyeSize * 0.28;
  const nameSize = eyeSize * 0.42;
  const handleSize = eyeSize * 0.3;
  const nameFont = `bold ${nameSize}px "Cinzel Decorative", Georgia, serif`;
  const handleFont = `${handleSize}px "Noto Sans", system-ui, sans-serif`;

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = nameFont;
  const nameW = measure.measureText("ÍléOtaku").width;
  measure.font = handleFont;
  const handleText = handle ? `@${handle.replace(/^@/, "")}` : "";
  const handleW = handleText ? measure.measureText(handleText).width : 0;

  const w = Math.ceil(Math.max(eyeSize, nameW, handleW) + pad * 2);
  const h = Math.ceil(pad + eyeSize + nameSize * 1.25 + (handleText ? handleSize * 1.3 : 0) + pad * 0.6);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;

  // Semi-transparent dark pill behind everything so the mark reads on any footage.
  g.globalAlpha = 0.7;
  g.fillStyle = "#0c0a07";
  g.beginPath();
  if (typeof g.roundRect === "function") g.roundRect(0, 0, w, h, pad * 0.9);
  else g.rect(0, 0, w, h);
  g.fill();

  g.globalAlpha = 0.95;
  g.drawImage(eye, (w - eyeSize) / 2, pad, eyeSize, eyeSize);

  g.textAlign = "center";
  g.fillStyle = "#d4a843";
  g.font = nameFont;
  g.fillText("ÍléOtaku", w / 2, pad + eyeSize + nameSize * 1.05);
  if (handleText) {
    g.globalAlpha = 0.85;
    g.fillStyle = "#f5ede0";
    g.font = handleFont;
    g.fillText(handleText, w / 2, pad + eyeSize + nameSize * 1.05 + handleSize * 1.25);
  }
  return c;
}

/** Downloads a video with the ÍléOtaku eye + name stamped bottom-right, TikTok-style. Runs entirely in the
 * browser: the video is fetched, played (silently, off-screen) onto a canvas with the mark drawn over
 * each frame, and re-recorded together with its original audio. That means it takes as long as the
 * video itself to finish (keep the tab open), and the file comes out as WebM (MP4 on Safari).
 * `onProgress` gets 0-100. Rejects if the browser can't do this — callers should fall back to
 * `downloadMediaDirect`. */
export async function downloadVideoWithWatermark(
  videoUrl: string,
  filename: string,
  creatorHandle: string,
  onProgress?: WatermarkProgress
): Promise<void> {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("This browser can't add a watermark.");
  }

  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Couldn't fetch the video (HTTP ${response.status}).`);
  const videoObjectUrl = URL.createObjectURL(await response.blob());

  const eye = new Image();
  eye.crossOrigin = "anonymous";
  const eyeLoaded = new Promise<void>((resolve, reject) => {
    eye.onload = () => resolve();
    eye.onerror = () => reject(new Error("Couldn't load the watermark icon."));
  });
  eye.src = "/icons/icon-128.png";

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = false;
  video.preload = "auto";
  const metadata = new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Couldn't read this video."));
  });
  video.src = videoObjectUrl;

  let audioContext: AudioContext | null = null;
  try {
    await Promise.all([metadata, eyeLoaded]);
    // Make sure the brand font is actually loaded before it's painted onto a canvas (canvas text silently
    // falls back to serif otherwise).
    await document.fonts?.load('bold 20px "Cinzel Decorative"').catch(() => {});

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const mark = renderWatermark(eye, canvas.width, canvas.height, creatorHandle);
    const margin = Math.min(canvas.width, canvas.height) * 0.03;
    const markX = canvas.width - mark.width - margin;
    const markY = canvas.height - mark.height - margin;

    // Original audio: routed into a recording destination only — NOT to the speakers, so nothing plays
    // out loud while the video is being processed.
    const combined = new MediaStream(canvas.captureStream(30).getVideoTracks());
    audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach((t) => combined.addTrack(t));
    await audioContext.resume();

    const { mimeType, extension } = pickRecorderFormat();
    const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let lastProgressAt = Date.now();
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearInterval(stallTimer);
        if (error) {
          if (recorder.state !== "inactive") recorder.stop();
          reject(error);
        } else {
          recorder.onstop = () => resolve();
          if (recorder.state !== "inactive") recorder.stop();
          else resolve();
        }
      };

      recorder.onerror = () => finish(new Error("Recording failed."));
      video.onended = () => finish();
      video.onerror = () => finish(new Error("Playback failed."));

      // A stalled decode (no forward progress for 20s) would otherwise hang the download forever.
      const stallTimer = setInterval(() => {
        if (Date.now() - lastProgressAt > 20000) finish(new Error("The video stopped playing."));
      }, 2000);

      const paint = () => {
        if (finished) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(mark, markX, markY);
        lastProgressAt = Date.now();
        if (video.duration > 0 && Number.isFinite(video.duration)) onProgress?.(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
        schedule();
      };
      const schedule = () => {
        const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(paint);
        else requestAnimationFrame(paint);
      };

      recorder.start(100);
      video.play().then(schedule).catch((e) => finish(e instanceof Error ? e : new Error("Couldn't start playback.")));
    });

    onProgress?.(100);
    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    // Beta feedback bug: "doesn't save anything, just an empty file" — whatever silently starved
    // the recorder of frames (a slow/rejected video.play() before the first paint, a backgrounded
    // tab throttling rAF, ...), saveBlob() would still write out a 0-byte file with no indication
    // anything went wrong. Failing loudly here at least surfaces it instead of handing back a
    // useless download that looks like it worked.
    if (blob.size < 1024) throw new Error("Recording produced no video data — try again with the tab in the foreground.");
    saveBlob(blob, `${filename}_ileotaku.${extension}`);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    audioContext?.close().catch(() => {});
    URL.revokeObjectURL(videoObjectUrl);
  }
}
