import { logError } from "./errorLogger";
import type { DownloadedChapterMeta } from "@/types";

const DB_NAME = "ileotaku-offline";
const DB_VERSION = 1;
const PAGES_STORE = "pages";
const CHAPTERS_STORE = "chapters";

/** Key convention requested by the spec: `ileotaku-chapter-{chapterId}` for the chapter's own
 * identity — individual pages are stored under `${chapterId}::${pageIndex}` inside PAGES_STORE
 * so a whole chapter's pages can be range-queried and deleted together via their key prefix. */
function pageKey(chapterId: string, pageIndex: number): string {
  return `ileotaku-chapter-${chapterId}::${pageIndex}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAGES_STORE)) {
        db.createObjectStore(PAGES_STORE);
      }
      if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
        db.createObjectStore(CHAPTERS_STORE, { keyPath: "chapterId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Tells the active service worker (if any) to also cache these page URLs at the HTTP layer —
 * a belt-and-suspenders fallback alongside the IndexedDB blobs stored below. Never blocks or
 * throws; a missing/uncontrolled service worker is a perfectly normal state. */
function notifyServiceWorker(urls: string[]): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CACHE_CHAPTER_PAGES", urls });
  } catch {
    // Non-fatal.
  }
}

export interface DownloadChapterMeta {
  mangaTitle: string;
  coverURL: string;
  chapterLabel: string;
}

/** Downloads every page of a chapter into IndexedDB as blobs, for fully-offline reading later.
 * `onProgress` fires after each page finishes, `(loaded, total)`, so callers can render a
 * progress bar. */
export async function downloadChapter(
  mangaId: string,
  chapterId: string,
  pages: string[],
  meta: DownloadChapterMeta,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const db = await openDb();
  let totalBytes = 0;

  try {
    for (let i = 0; i < pages.length; i++) {
      const res = await fetch(pages[i]);
      if (!res.ok) throw new Error(`Failed to fetch page ${i + 1}`);
      const blob = await res.blob();
      totalBytes += blob.size;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PAGES_STORE, "readwrite");
        tx.objectStore(PAGES_STORE).put(blob, pageKey(chapterId, i));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      onProgress?.(i + 1, pages.length);
    }

    const record: DownloadedChapterMeta = {
      chapterId,
      mangaId,
      mangaTitle: meta.mangaTitle,
      coverURL: meta.coverURL,
      chapterLabel: meta.chapterLabel,
      pageCount: pages.length,
      sizeBytes: totalBytes,
      downloadedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHAPTERS_STORE, "readwrite");
      tx.objectStore(CHAPTERS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    notifyServiceWorker(pages);
  } catch (error) {
    await logError(error, { operation: "offlineReader.downloadChapter", chapterId });
    // Roll back any partial pages so a failed download doesn't masquerade as a complete one.
    await deleteDownloadedChapter(chapterId).catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

/** Returns blob: URLs for every downloaded page of a chapter, in page order. Caller is
 * responsible for revoking them (URL.revokeObjectURL) once no longer needed. */
export async function getDownloadedChapter(chapterId: string): Promise<string[]> {
  const db = await openDb();
  try {
    const meta = await promisifyRequest(db.transaction(CHAPTERS_STORE, "readonly").objectStore(CHAPTERS_STORE).get(chapterId));
    if (!meta) return [];
    const pageCount = (meta as DownloadedChapterMeta).pageCount;
    const tx = db.transaction(PAGES_STORE, "readonly");
    const store = tx.objectStore(PAGES_STORE);
    const blobs = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => promisifyRequest(store.get(pageKey(chapterId, i))))
    );
    return blobs
      .filter((b): b is Blob => b instanceof Blob)
      .map((blob) => URL.createObjectURL(blob));
  } finally {
    db.close();
  }
}

export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  const db = await openDb();
  try {
    const meta = await promisifyRequest(db.transaction(CHAPTERS_STORE, "readonly").objectStore(CHAPTERS_STORE).get(chapterId));
    return meta != null;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export async function deleteDownloadedChapter(chapterId: string): Promise<void> {
  const db = await openDb();
  try {
    const meta = (await promisifyRequest(
      db.transaction(CHAPTERS_STORE, "readonly").objectStore(CHAPTERS_STORE).get(chapterId)
    )) as DownloadedChapterMeta | undefined;
    const pageCount = meta?.pageCount ?? 0;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PAGES_STORE, CHAPTERS_STORE], "readwrite");
      const pagesStore = tx.objectStore(PAGES_STORE);
      for (let i = 0; i < pageCount; i++) pagesStore.delete(pageKey(chapterId, i));
      tx.objectStore(CHAPTERS_STORE).delete(chapterId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getDownloadedChapters(): Promise<DownloadedChapterMeta[]> {
  const db = await openDb();
  try {
    const all = await promisifyRequest(db.transaction(CHAPTERS_STORE, "readonly").objectStore(CHAPTERS_STORE).getAll());
    return (all as DownloadedChapterMeta[]).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** Total storage used by all downloaded chapters, in megabytes. */
export async function getStorageUsed(): Promise<number> {
  const chapters = await getDownloadedChapters();
  const totalBytes = chapters.reduce((sum, c) => sum + c.sizeBytes, 0);
  return totalBytes / (1024 * 1024);
}

export async function deleteAllDownloads(): Promise<void> {
  const chapters = await getDownloadedChapters();
  await Promise.all(chapters.map((c) => deleteDownloadedChapter(c.chapterId)));
}
