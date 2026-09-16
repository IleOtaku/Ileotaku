/**
 * PART 8 — Video watermarking, entirely client-side via the Canvas + MediaRecorder APIs (no
 * server-side transcoding pipeline exists on this project, and adding one — e.g. ffmpeg on a
 * Cloud Function — is real infrastructure this project doesn't have; see the final report for
 * why that stays out of scope here). Re-renders the source video frame-by-frame onto a canvas
 * with a watermark drawn on top, and records the canvas back out as a new WebM file.
 *
 * Output is always .webm (MediaRecorder's only broadly-supported container/codec combination
 * across browsers without a bundled encoder) — Cloudinary transcodes on ingest for playback
 * compatibility the same way it already does for any other uploaded video format.
 */
/** `HTMLVideoElement.captureStream()` is real, shipped, standard-track browser API (Chrome,
 * Firefox, Edge) but isn't part of TypeScript's bundled DOM lib types yet — this is the minimal
 * ambient extension needed to call it without an `any` cast. */
interface VideoElementWithCapture extends HTMLVideoElement {
  captureStream?: () => MediaStream;
}

export async function addWatermarkToVideo(
  videoFile: File,
  watermarkText: string = "ÍléOtaku",
  onProgress?: (percent: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas isn't supported in this browser."));
      return;
    }

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const canvasStream = canvas.captureStream(30);
      // Canvas streams carry video only — pull the ORIGINAL audio track (if any) straight off the
      // <video> element itself via its own captureStream(), so watermarking a video never
      // silently strips its sound. captureStream() is unsupported only on very old Safari; when
      // it's missing, the output is video-only rather than failing the whole upload outright.
      let audioTracks: MediaStreamTrack[] = [];
      const capturableVideo = video as VideoElementWithCapture;
      if (typeof capturableVideo.captureStream === "function") {
        audioTracks = capturableVideo.captureStream().getAudioTracks();
      }
      const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      mediaRecorder.onerror = (e) => reject(e);

      video.onplay = () => {
        mediaRecorder.start();
        const drawFrame = () => {
          if (video.ended || video.paused) {
            mediaRecorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.font = `bold ${Math.max(16, Math.round(canvas.width / 30))}px sans-serif`;
          ctx.fillStyle = "#d4a843";
          ctx.textAlign = "right";
          ctx.fillText(watermarkText, canvas.width - 20, canvas.height - 20);
          ctx.restore();

          onProgress?.(video.duration ? Math.min(99, Math.round((video.currentTime / video.duration) * 100)) : 0);
          requestAnimationFrame(drawFrame);
        };
        drawFrame();
      };

      video.play().catch(reject);
    };

    video.onerror = () => reject(new Error("Couldn't read this video file."));
    video.src = URL.createObjectURL(videoFile);
    video.muted = true; // the <video> element itself stays silent during re-encoding — its audio
    // track is still captured via captureStream() above regardless of this element's own mute
    // state, and playing it audibly during upload would be a jarring, pointless side effect.
    video.load();
  });
}
