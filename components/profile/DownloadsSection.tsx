"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { HardDrive, Trash2 } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import {
  deleteAllDownloads,
  deleteDownloadedChapter,
  getDownloadedChapters,
  getStorageUsed,
} from "@/lib/offlineReader";
import { proxyImg } from "@/lib/manga-api";
import type { DownloadedChapterMeta } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/** Profile Library's Downloads section: every chapter saved for offline reading, grouped by
 * manga, with a per-chapter delete (single click arms a "Confirm?" state, matching the rest of
 * the app's in-UI confirmation pattern rather than a native browser dialog) and a top-level
 * "Delete All Downloads" plus total storage used. */
export default function DownloadsSection() {
  const [chapters, setChapters] = useState<DownloadedChapterMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageMB, setStorageMB] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [list, mb] = await Promise.all([getDownloadedChapters(), getStorageUsed()]);
      setChapters(list);
      setStorageMB(mb);
    } catch {
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(chapterId: string) {
    if (confirmingId !== chapterId) {
      setConfirmingId(chapterId);
      return;
    }
    setConfirmingId(null);
    try {
      await deleteDownloadedChapter(chapterId);
      toast.success("Download removed.");
      await refresh();
    } catch {
      toast.error("Couldn't remove this download.");
    }
  }

  async function handleDeleteAll() {
    if (!confirmingAll) {
      setConfirmingAll(true);
      return;
    }
    setConfirmingAll(false);
    try {
      await deleteAllDownloads();
      toast.success("All downloads removed.");
      await refresh();
    } catch {
      toast.error("Couldn't clear your downloads.");
    }
  }

  const grouped = chapters.reduce<Record<string, DownloadedChapterMeta[]>>((acc, ch) => {
    (acc[ch.mangaId] ??= []).push(ch);
    return acc;
  }, {});

  if (loading) {
    return (
      <div>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Downloads</h3>
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-syne text-sm font-semibold text-text">Downloads</h3>
        {chapters.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-noto text-xs text-muted">
              <HardDrive className="h-3.5 w-3.5" /> {storageMB.toFixed(1)} MB used
            </span>
            <button
              type="button"
              onClick={handleDeleteAll}
              className={`btn-ghost text-xs ${confirmingAll ? "text-clay2" : ""}`}
            >
              <Trash2 className="h-3.5 w-3.5" /> {confirmingAll ? "Confirm delete all?" : "Delete All Downloads"}
            </button>
          </div>
        )}
      </div>

      {chapters.length === 0 ? (
        <EmptyState
          title="No downloads yet"
          description="Platinum members can download chapters from the reader for offline reading."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([mangaId, list]) => (
            <div key={mangaId} className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-bg3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy" src={proxyImg(list[0].coverURL)} alt={list[0].mangaTitle} className="h-full w-full object-cover" />
                </div>
                <p className="font-syne text-sm font-semibold text-text">{list[0].mangaTitle}</p>
              </div>
              <div className="flex flex-col divide-y divide-bg4">
                {list.map((ch) => (
                  <div key={ch.chapterId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-noto text-sm text-text">{ch.chapterLabel}</p>
                      <p className="font-noto text-[11px] text-muted">
                        {formatBytes(ch.sizeBytes)} · {new Date(ch.downloadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(ch.chapterId)}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 font-noto text-xs transition-colors ${
                        confirmingId === ch.chapterId
                          ? "bg-clay/20 text-clay2"
                          : "text-muted hover:bg-bg3 hover:text-clay2"
                      }`}
                    >
                      {confirmingId === ch.chapterId ? "Confirm?" : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
