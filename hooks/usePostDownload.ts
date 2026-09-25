"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { downloadMediaDirect, downloadWatermarkedVideo } from "@/lib/videoDownload";
import { getUserProfile } from "@/lib/firestore";
import type { CreatorPost } from "@/types";

type DownloadablePost = Pick<CreatorPost, "id" | "uid" | "handle" | "content" | "videoUrl" | "attachments" | "disableDownloads">;

function safeName(post: DownloadablePost): string {
  const base = post.content
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return base || `ileotaku-${post.id}`;
}

/** Download for a feed post's media, used by BOTH the post's three-dot menu and the share sheet so there is
 * no way to get an unmarked copy through the other door.
 *
 * Videos are watermarked (ÍléOtaku eye + name + the creator's @handle) at download time, in the browser,
 * unless the CREATOR turned "Add watermark to downloads" off — that's the post author's setting, so it's
 * read from their profile, not the downloader's. Photos are never watermarked. The author's own
 * downloads are never blocked, and posts with downloads disabled hide the option for everyone else. */
export function usePostDownload(post: DownloadablePost) {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);

  const mediaUrl = post.videoUrl || post.attachments?.[0];
  const canDownload = !!mediaUrl && (!post.disableDownloads || post.uid === user?.uid);

  async function download() {
    if (!mediaUrl || downloading) return;
    setDownloading(true);
    const toastId = `download-${post.id}`;
    try {
      if (!post.videoUrl) {
        await downloadMediaDirect(mediaUrl, `${safeName(post)}.jpg`);
        return;
      }

      const author = await getUserProfile(post.uid).catch(() => null);
      const watermarkOn = author?.creatorSettings?.videoWatermark !== false;
      if (!watermarkOn) {
        await downloadMediaDirect(post.videoUrl, `${safeName(post)}.mp4`);
        return;
      }

      toast.loading("Preparing download...", { id: toastId });
      try {
        await downloadWatermarkedVideo(post.videoUrl, safeName(post));
        toast.success("Downloaded with the ÍléOtaku watermark.", { id: toastId });
      } catch (error) {
        console.error("[download] watermark failed:", error);
        toast.error("Couldn't add the watermark — downloading the original instead.", { id: toastId });
        await downloadMediaDirect(post.videoUrl, `${safeName(post)}.mp4`);
      }
    } catch {
      toast.error("Couldn't download this.", { id: toastId });
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading, canDownload };
}
