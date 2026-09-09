import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { NotificationType, type PublishedChapter, type PublishedSeries } from "@/types";
import type { MangaChapterSummary, MangaDetailData } from "./apis/types";

const PUBLISHED_SERIES = "publishedSeries";
// Reuses the existing top-level `series/{id}` collection (already home to comments/ratings for
// the external catalog, keyed by the same id) as the parent of the new `chapters` subcollection
// — matching the Sprint 9f spec's `series/{workId}/chapters` path exactly.
const SERIES = "series";

/**
 * Explore's "African Originals" rail — the most recently published creator works, across every
 * creator. Ordered by publishedAt desc so a brand-new release always surfaces first.
 */
export async function getAfricanOriginals(take = 12): Promise<PublishedSeries[]> {
  try {
    const q = query(
      collection(db, PUBLISHED_SERIES),
      where("source", "==", "creator"),
      orderBy("publishedAt", "desc"),
      limit(take)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedSeries);
  } catch (error) {
    await logError(error, { operation: "getAfricanOriginals" });
    return [];
  }
}

/** Looks up a published work by its copyright certificate id — powers the printable
 * /creator/certificate/[certId] page, which only ever has the certId (never the workId) in
 * its URL. */
export async function getPublishedSeriesByCertId(certId: string): Promise<PublishedSeries | null> {
  try {
    const q = query(collection(db, PUBLISHED_SERIES), where("certId", "==", certId), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as PublishedSeries);
  } catch (error) {
    await logError(error, { operation: "getPublishedSeriesByCertId", certId });
    return null;
  }
}

export async function getPublishedSeries(workId: string): Promise<PublishedSeries | null> {
  try {
    const snap = await getDoc(doc(db, PUBLISHED_SERIES, workId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PublishedSeries) : null;
  } catch (error) {
    await logError(error, { operation: "getPublishedSeries", workId });
    return null;
  }
}

/** /creator/[handle]'s Works tab: every published work by one author, newest first. Falls back
 * to querying by authorId when the profile has no handle yet. */
export async function getPublishedSeriesByAuthor(opts: {
  handle?: string;
  uid?: string;
}): Promise<PublishedSeries[]> {
  const field = opts.handle ? "authorHandle" : "authorId";
  const value = opts.handle ?? opts.uid;
  if (!value) return [];
  try {
    const q = query(collection(db, PUBLISHED_SERIES), where(field, "==", value));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as PublishedSeries)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  } catch (error) {
    await logError(error, { operation: "getPublishedSeriesByAuthor", opts });
    return [];
  }
}

export async function getSeriesChapters(workId: string): Promise<PublishedChapter[]> {
  try {
    const q = query(collection(db, SERIES, workId, "chapters"), orderBy("chapterNumber", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedChapter);
  } catch (error) {
    await logError(error, { operation: "getSeriesChapters", workId });
    return [];
  }
}

/**
 * MangaDetailData-shaped projection of a creator work — lets getMangaDetail() in lib/manga-api.ts
 * hand a creator-published series to /manga/[id] and the reader through the exact same shape an
 * imported MangaDex/Comick/MangaHook title uses, with `source: "creator"` as the only signal
 * those pages need to special-case anything (the "African Original 🌍" badge, the Creator card's
 * link to /creator/[handle]).
 *
 * Each chapter's `id` is encoded as `creator:{workId}:{chapterDocId}` rather than the bare
 * Firestore doc id — getChapterPages() below parses that composite id back apart, since it only
 * ever receives a chapter id in isolation (never the parent workId alongside it).
 */
export async function getPublishedSeriesDetail(workId: string): Promise<MangaDetailData | null> {
  const series = await getPublishedSeries(workId);
  if (!series) return null;
  const chapters = await getSeriesChapters(workId);
  const chapterList: MangaChapterSummary[] = chapters.map((c) => ({
    id: `creator:${workId}:${c.id}`,
    chapter: c.title?.trim() || `Chapter ${c.chapterNumber}`,
    createdAt: c.publishedAt,
    coinPrice: c.coinPrice,
  }));

  return {
    id: workId,
    title: series.title,
    image: series.coverImage,
    description: series.description,
    author: series.authorName,
    status: "ongoing",
    genres: series.genres,
    chapterList,
    source: "creator",
    authorId: series.authorId,
    authorHandle: series.authorHandle,
    authorPhotoURL: series.authorPhotoURL,
    contentRating: series.contentRating,
    format: series.format,
    language: series.language,
  };
}

/** Parses a `creator:{workId}:{chapterDocId}` composite chapter id and returns that chapter's
 * page images, or null if the id isn't a creator-chapter id or the chapter no longer exists. */
export async function getCreatorChapterPages(compositeId: string): Promise<string[] | null> {
  if (!compositeId.startsWith("creator:")) return null;
  const [, workId, chapterId] = compositeId.split(":");
  if (!workId || !chapterId) return null;
  try {
    const snap = await getDoc(doc(db, SERIES, workId, "chapters", chapterId));
    if (!snap.exists()) return null;
    return (snap.data() as PublishedChapter).images ?? [];
  } catch (error) {
    await logError(error, { operation: "getCreatorChapterPages", compositeId });
    return null;
  }
}

/**
 * Creator dashboard's "Add Chapter" flow, for an already-approved/published work: writes the
 * chapter doc under series/{workId}/chapters, bumps chapterCount on the publishedSeries summary,
 * and fires a NEW_CHAPTER notification to every one of the author's followers.
 */
export async function addChapter(
  workId: string,
  chapter: { chapterNumber: number; title: string; images: string[]; coinPrice: number }
): Promise<string> {
  const ref = await addDoc(collection(db, SERIES, workId, "chapters"), {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    images: chapter.images,
    coinPrice: chapter.coinPrice,
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, PUBLISHED_SERIES, workId), { chapterCount: increment(1) });
  // The source-of-truth creatorWorks doc mirrors chapterCount too, so the creator dashboard's
  // own work list (which reads from creatorWorks, not publishedSeries) stays in sync.
  await updateDoc(doc(db, "creatorWorks", workId), { chapterCount: increment(1) }).catch(() => {});

  try {
    const series = await getPublishedSeries(workId);
    if (series) {
      const authorSnap = await getDoc(doc(db, "users", series.authorId));
      const followers: string[] = authorSnap.exists() ? (authorSnap.data().followers ?? []) : [];
      const label = chapter.title?.trim() || `Chapter ${chapter.chapterNumber}`;
      await Promise.all(
        followers.map((uid) =>
          createNotification(
            uid,
            NotificationType.NEW_CHAPTER,
            "New chapter!",
            `${series.title} — ${label} is out now.`,
            `/manga/${workId}`,
            series.coverImage
          ).catch(() => {})
        )
      );
    }
  } catch (error) {
    await logError(error, { operation: "addChapter.notifyFollowers", workId });
  }

  return ref.id;
}
