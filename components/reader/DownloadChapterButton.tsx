"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, CloudDownload, Loader2 } from "lucide-react";
import PlatinumGate from "@/components/monetisation/PlatinumGate";
import { downloadChapter, isChapterDownloaded } from "@/lib/offlineReader";

export interface DownloadChapterButtonProps {
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  coverURL: string;
  chapterLabel: string;
  pages: string[];
}

/** Platinum-only chapter download control for the reader toolbar: idle (download icon) ->
 * downloading (inline progress bar, updates per page fetched) -> downloaded (checkmark). */
export default function DownloadChapterButton({
  mangaId,
  chapterId,
  mangaTitle,
  coverURL,
  chapterLabel,
  pages,
}: DownloadChapterButtonProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    isChapterDownloaded(chapterId)
      .then((v) => {
        if (!cancelled) setDownloaded(v);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  async function handleDownload() {
    if (downloading || downloaded || pages.length === 0) return;
    setDownloading(true);
    setProgress(0);
    try {
      await downloadChapter(
        mangaId,
        chapterId,
        pages,
        { mangaTitle, coverURL, chapterLabel },
        (loaded, total) => setProgress(Math.round((loaded / total) * 100))
      );
      setDownloaded(true);
      toast.success(`${chapterLabel} downloaded for offline reading.`);
    } catch {
      toast.error("Couldn't download this chapter. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PlatinumGate compact title="Offline" description="Offline downloads are a Platinum feature.">
      <button
        type="button"
        onClick={handleDownload}
        disabled={!checked || downloading || downloaded || pages.length === 0}
        className={`relative flex items-center gap-1 overflow-hidden rounded-lg border px-2.5 py-1.5 font-noto text-xs transition-colors ${
          downloaded
            ? "border-green2 bg-green/15 text-green2"
            : "border-muted2 bg-bg3 text-muted hover:border-clay hover:text-clay2"
        }`}
      >
        {downloading && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-clay/25 transition-all"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className="relative flex items-center gap-1">
          {downloading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}%
            </>
          ) : downloaded ? (
            <>
              <Check className="h-3.5 w-3.5" /> Downloaded
            </>
          ) : (
            <>
              <CloudDownload className="h-3.5 w-3.5" /> Download
            </>
          )}
        </span>
      </button>
    </PlatinumGate>
  );
}
