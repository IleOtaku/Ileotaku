import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { getUserByHandle } from "./firestore";
import {
  NotificationType,
  type ChapterDraft,
  type OwnershipTransferRequest,
  type PublishedChapter,
  type PublishedSeries,
} from "@/types";
import type { MangaChapterSummary, MangaDetailData, MangaListItem } from "./apis/types";

const PUBLISHED_SERIES = "publishedSeries";
// Reuses the existing top-level `series/{id}` collection (already home to comments/ratings for
// the external catalog, keyed by the same id) as the parent of the new `chapters` subcollection
// — matching the Sprint 9f spec's `series/{workId}/chapters` path exactly.
const SERIES = "series";

/**
 * Explore's "African Originals" rail (and Home's) — the most recently published creator
 * manga/manhwa/manhua works, across every creator. Prose works are excluded here; they get their
 * own "Latest Prose Stories" rail instead (see getAfricanOriginals's own doc comment history: it
 * used to also include prose before format existed as a first-class distinction). Ordered by
 * publishedAt desc so a brand-new release always surfaces first. Fetches a bit more than `take`
 * so filtering prose out afterward still leaves a full page of results.
 */
export async function getAfricanOriginals(take = 12): Promise<PublishedSeries[]> {
  try {
    const all = await getAllPublishedSeries(take * 3);
    return all.filter((s) => (s.format ?? "").toLowerCase() !== "prose").slice(0, take);
  } catch (error) {
    await logError(error, { operation: "getAfricanOriginals" });
    return [];
  }
}

/* ============================== Browse / search (Part 1: creator-only catalog) ============================== */

/** Every published work across every creator and format, newest first — the shared source list
 * Browse, Search, Explore and lib/manga-api.ts's getMangaList/searchManga all filter and sort
 * client-side (by format/genre/title/reads/rating) from, rather than each running its own
 * differently-shaped Firestore query. That keeps this to the one already-proven query shape (a
 * single orderBy, no composite index to provision) instead of needing a new index per filter. */
export async function getAllPublishedSeries(take = 300): Promise<PublishedSeries[]> {
  try {
    const q = query(collection(db, PUBLISHED_SERIES), orderBy("publishedAt", "desc"), limit(take));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedSeries);
  } catch (error) {
    await logError(error, { operation: "getAllPublishedSeries" });
    return [];
  }
}

function isProseSeries(series: PublishedSeries): boolean {
  return (series.format ?? "").toLowerCase() === "prose";
}

function toMangaListItem(series: PublishedSeries): MangaListItem {
  return {
    id: series.id,
    title: series.title,
    image: series.coverImage,
    chapter: series.chapterCount ? `Chapter ${series.chapterCount}` : undefined,
    view: series.totalReads ? String(series.totalReads) : undefined,
    source: "creator",
    format: series.format,
  };
}

/** Browse's "All Works" tab — every format together, so a prose result can be told apart
 * (via its `format`) and routed to /story/[id] instead of the manga reader. */
export async function listAllCreatorWorks(genre?: string): Promise<MangaListItem[]> {
  const all = await getAllPublishedSeries();
  const filtered =
    genre && genre.toLowerCase() !== "all"
      ? all.filter((s) => s.genres.some((g) => g.toLowerCase() === genre.toLowerCase()))
      : all;
  return filtered.map(toMangaListItem);
}

export async function searchAllCreatorWorks(keyword: string): Promise<MangaListItem[]> {
  const q = keyword.trim().toLowerCase();
  const all = await getAllPublishedSeries();
  const matched = q ? all.filter((s) => s.title.toLowerCase().includes(q)) : all;
  return matched.map(toMangaListItem);
}

/** Browse (/reader) and the landing Trending rail's manga list — every published manga/manhwa/
 * manhua work (prose is excluded; it's browsed/read separately at /story/[id]), optionally
 * filtered to one genre. */
export async function listCreatorMangaWorks(genre?: string): Promise<MangaListItem[]> {
  const all = await getAllPublishedSeries();
  const mangaOnly = all.filter((s) => !isProseSeries(s));
  const filtered =
    genre && genre.toLowerCase() !== "all"
      ? mangaOnly.filter((s) => s.genres.some((g) => g.toLowerCase() === genre.toLowerCase()))
      : mangaOnly;
  return filtered.map(toMangaListItem);
}

export async function searchCreatorMangaWorks(keyword: string): Promise<MangaListItem[]> {
  const q = keyword.trim().toLowerCase();
  const all = await getAllPublishedSeries();
  const mangaOnly = all.filter((s) => !isProseSeries(s));
  const matched = q ? mangaOnly.filter((s) => s.title.toLowerCase().includes(q)) : mangaOnly;
  return matched.map(toMangaListItem);
}

/** Explore's "Latest Prose Stories" rail. */
export async function listCreatorProseWorks(take = 24): Promise<PublishedSeries[]> {
  const all = await getAllPublishedSeries();
  return all.filter(isProseSeries).slice(0, take);
}

/** Browse's Prose Stories tab — same prose-only filter as listCreatorProseWorks, shaped as a
 * MangaListItem[] to match the reader sidebar's list rendering. */
export async function listCreatorProseWorksAsList(genre?: string): Promise<MangaListItem[]> {
  const all = await getAllPublishedSeries();
  const proseOnly = all.filter(isProseSeries);
  const filtered =
    genre && genre.toLowerCase() !== "all"
      ? proseOnly.filter((s) => s.genres.some((g) => g.toLowerCase() === genre.toLowerCase()))
      : proseOnly;
  return filtered.map(toMangaListItem);
}

export async function searchCreatorProseWorksAsList(keyword: string): Promise<MangaListItem[]> {
  const q = keyword.trim().toLowerCase();
  const all = await getAllPublishedSeries();
  const proseOnly = all.filter(isProseSeries);
  const matched = q ? proseOnly.filter((s) => s.title.toLowerCase().includes(q)) : proseOnly;
  return matched.map(toMangaListItem);
}

/** Search's Works tab: both manga and prose (optionally narrowed to one format), matched by
 * title, author, or genre against the query — mirrors the substring-match convention the old
 * hardcoded fallback catalog used for the same tab, since Firestore has no native "contains". */
export async function searchPublishedWorks(
  keyword: string,
  format?: "manga" | "prose"
): Promise<PublishedSeries[]> {
  const q = keyword.trim().toLowerCase();
  const all = await getAllPublishedSeries();
  const byFormat =
    format === "prose" ? all.filter(isProseSeries) : format === "manga" ? all.filter((s) => !isProseSeries(s)) : all;
  if (!q) return byFormat;
  return byFormat.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.authorName.toLowerCase().includes(q) ||
      s.genres.some((g) => g.toLowerCase().includes(q))
  );
}

/** Fire-and-forget read counter, called once per chapter a reader actually opens (manga/manhwa/
 * manhua via ReaderClient, prose via app/story/[workId]) — mirrors lib/contentLocking.ts's
 * trackMangaRead() for imported sources, but bumps publishedSeries.totalReads directly rather
 * than a separate mangaStats doc, since that field is what Explore's Trending rail and every
 * work card's "reads" figure already read. Never throws into the UI — a missed count is a lost
 * analytics point, not a broken page. */
export async function incrementSeriesReads(workId: string): Promise<void> {
  try {
    await updateDoc(doc(db, PUBLISHED_SERIES, workId), { totalReads: increment(1) });
  } catch (error) {
    await logError(error, { operation: "incrementSeriesReads", workId });
  }
}

/** Explore's "Trending" rail — highest totalReads across every format. */
export async function getTrendingPublishedSeries(take = 12): Promise<PublishedSeries[]> {
  const all = await getAllPublishedSeries();
  return [...all].sort((a, b) => (b.totalReads ?? 0) - (a.totalReads ?? 0)).slice(0, take);
}

/** Explore's "Top Rated" rail — only works with at least one real rating. */
export async function getTopRatedPublishedSeries(take = 12): Promise<PublishedSeries[]> {
  const all = await getAllPublishedSeries();
  return [...all]
    .filter((s) => (s.averageRating ?? 0) > 0)
    .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))
    .slice(0, take);
}

/** Home's "Latest from Creators You Follow" section — every published work (any format) by an
 * author the signed-in reader follows, newest first. Filters client-side from the same shared
 * catalog list rather than a `where("authorId", "in", ...)` query, which would need its own
 * composite index and also caps at 30 values — a following list can exceed that. */
export async function getLatestFromFollowing(followingUids: string[], take = 12): Promise<PublishedSeries[]> {
  if (followingUids.length === 0) return [];
  const following = new Set(followingUids);
  const all = await getAllPublishedSeries();
  return all.filter((s) => following.has(s.authorId)).slice(0, take);
}

/** Explore's "Featured Creator Works" rail — admin-curated via ApprovedWorkCard's Feature toggle
 * (lib/admin.ts's toggleWorkFlags, mirrored here onto publishedSeries.isFeatured). */
export async function getFeaturedPublishedSeries(take = 6): Promise<PublishedSeries[]> {
  const all = await getAllPublishedSeries();
  return all.filter((s) => s.isFeatured === true).slice(0, take);
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

/** Live version of getPublishedSeries — the manga detail page's header stats strip subscribes
 * to this so `totalReads` (bumped by incrementSeriesReads on every chapter open) and
 * `chapterCount`/`averageRating` all update in real time with no manual refresh. */
export function subscribeToPublishedSeries(
  workId: string,
  callback: (series: PublishedSeries | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, PUBLISHED_SERIES, workId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as PublishedSeries) : null),
    () => callback(null)
  );
}

/** Live chapter count for one work — the header stats strip subscribes to this so a newly
 * published chapter shows up in "📖 N chapters" the instant the creator publishes it. */
export function subscribeToChapterCount(workId: string, callback: (count: number) => void): Unsubscribe {
  return onSnapshot(
    collection(db, SERIES, workId, "chapters"),
    (snap) => callback(snap.size),
    () => callback(0)
  );
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

/** Words-per-minute assumption behind a prose chapter's estimated read time — the commonly-cited
 * average adult silent-reading speed. */
const PROSE_WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function estimateReadMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / PROSE_WORDS_PER_MINUTE));
}

export interface NewChapterInput {
  chapterNumber: number;
  title: string;
  coinPrice: number;
  /** Manga/manhwa/manhua chapters. */
  images?: string[];
  /** Prose chapters — wordCount/estimatedReadTime are derived from this, not passed in. */
  content?: string;
}

/**
 * Creator dashboard's "Add Chapter" flow, for an already-approved/published work: writes the
 * chapter doc under series/{workId}/chapters, bumps chapterCount (and, for a prose chapter,
 * totalWordCount) on the publishedSeries summary, and fires a NEW_CHAPTER notification to every
 * one of the author's followers. Handles both image-page (manga/manhwa/manhua) and plain-text
 * (prose) chapters — which one a given call writes is just whichever of `images`/`content` it
 * passes, matching the parent work's own format.
 */
export async function addChapter(workId: string, chapter: NewChapterInput): Promise<string> {
  const isProse = chapter.content !== undefined;
  const wordCount = isProse ? countWords(chapter.content!) : undefined;
  const estimatedReadTime = wordCount !== undefined ? estimateReadMinutes(wordCount) : undefined;

  const ref = await addDoc(collection(db, SERIES, workId, "chapters"), {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    images: chapter.images ?? [],
    coinPrice: chapter.coinPrice,
    status: "published",
    publishedAt: new Date().toISOString(),
    ...(isProse ? { content: chapter.content, wordCount, estimatedReadTime } : {}),
  });
  await updateDoc(doc(db, PUBLISHED_SERIES, workId), {
    chapterCount: increment(1),
    ...(wordCount !== undefined ? { totalWordCount: increment(wordCount) } : {}),
  });
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

/* ============================== Delete work (Part 12) ============================== */

/**
 * Permanently deletes a creator's work: every chapter doc, the publishedSeries summary (which
 * is what actually removes it from Explore/the reader/search — those all query that collection,
 * never creatorWorks directly), and the source creatorWorks doc itself.
 *
 * Two things this deliberately does NOT do, both flagged rather than silently skipped:
 * - Cloudinary cleanup: chapter/cover images are stored as plain secure_urls, not the publicId
 *   deleteFile() (lib/cloudinary.ts) needs — deriving a publicId by parsing the URL risks
 *   deleting the wrong asset if the parse is ever wrong, so orphaned files are left in the
 *   Cloudinary account (a storage cost, not a functional bug) rather than risk that.
 * - Reverse-updating other readers' `unlocked` chapter records: there's no reverse index from a
 *   chapter id to who unlocked it, and a collectionGroup scan across every user's `unlocked`
 *   subcollection for one deleted work isn't worth the read cost — an unlocked-but-now-gone
 *   chapter just 404s the same as any other removed content, no different from an imported
 *   source's chapter disappearing upstream.
 */
export async function deleteWork(workId: string): Promise<void> {
  try {
    const chaptersSnap = await getDocs(collection(db, SERIES, workId, "chapters"));
    if (!chaptersSnap.empty) {
      const batch = writeBatch(db);
      chaptersSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const draftsSnap = await getDocs(collection(db, SERIES, workId, "draftChapters"));
    if (!draftsSnap.empty) {
      const batch = writeBatch(db);
      draftsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, PUBLISHED_SERIES, workId)).catch(() => {});
    await deleteDoc(doc(db, "creatorWorks", workId));
  } catch (error) {
    await logError(error, { operation: "deleteWork", workId });
    throw error;
  }
}

/* ============================== Edit series / chapters (Part 12) ============================== */

export interface SeriesDetailsPatch {
  title?: string;
  description?: string;
  genres?: string[];
  coverURL?: string;
  updateSchedule?: string;
  contentRating?: string;
}

/** Updates series-level details on BOTH creatorWorks (the source of truth the dashboard reads)
 * and publishedSeries (the public-facing summary Explore/the reader/search all query) so the
 * two never drift apart — publishedSeries only exists once a work has actually been approved,
 * so that half is skipped (not an error) for a work still pending/rejected. */
export async function updateSeriesDetails(workId: string, patch: SeriesDetailsPatch): Promise<void> {
  try {
    const now = new Date().toISOString();
    const workPatch: Record<string, unknown> = { ...patch, updatedAt: now };
    if (patch.coverURL) workPatch.coverURL = patch.coverURL;
    await updateDoc(doc(db, "creatorWorks", workId), workPatch);

    const publishedPatch: Record<string, unknown> = { ...patch };
    if (patch.coverURL) publishedPatch.coverImage = patch.coverURL;
    const publishedSnap = await getDoc(doc(db, PUBLISHED_SERIES, workId));
    if (publishedSnap.exists()) {
      await updateDoc(doc(db, PUBLISHED_SERIES, workId), publishedPatch);
    }
  } catch (error) {
    await logError(error, { operation: "updateSeriesDetails", workId });
    throw error;
  }
}

export interface ChapterPatch {
  title?: string;
  coinPrice?: number;
  images?: string[];
  chapterNumber?: number;
  content?: string;
  wordCount?: number;
  estimatedReadTime?: number;
}

/** Edits an already-published chapter in place — title, price, page order/set, or its number
 * (which changes its sort position in the chapter list). Changes are visible on the public
 * manga page and in the reader immediately since both read this same doc live. */
export async function updateChapter(workId: string, chapterId: string, patch: ChapterPatch): Promise<void> {
  try {
    await updateDoc(doc(db, SERIES, workId, "chapters", chapterId), { ...patch });
  } catch (error) {
    await logError(error, { operation: "updateChapter", workId, chapterId });
    throw error;
  }
}

/* ============================== Chapter drafts (Part 12) ============================== */

export async function getChapterDrafts(workId: string): Promise<ChapterDraft[]> {
  try {
    const snap = await getDocs(collection(db, SERIES, workId, "draftChapters"));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as ChapterDraft)
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } catch (error) {
    await logError(error, { operation: "getChapterDrafts", workId });
    return [];
  }
}

export async function saveChapterDraft(workId: string, draft: NewChapterInput): Promise<string> {
  const isProse = draft.content !== undefined;
  const wordCount = isProse ? countWords(draft.content!) : undefined;
  const estimatedReadTime = wordCount !== undefined ? estimateReadMinutes(wordCount) : undefined;

  const ref = await addDoc(collection(db, SERIES, workId, "draftChapters"), {
    chapterNumber: draft.chapterNumber,
    title: draft.title,
    images: draft.images ?? [],
    coinPrice: draft.coinPrice,
    ...(isProse ? { content: draft.content, wordCount, estimatedReadTime } : {}),
    savedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function deleteChapterDraft(workId: string, draftId: string): Promise<void> {
  await deleteDoc(doc(db, SERIES, workId, "draftChapters", draftId));
}

/** Publishes a saved draft as a real chapter (via the same addChapter path a fresh upload takes,
 * so it gets the same follower-notification behavior), then removes the draft. */
export async function publishChapterDraft(workId: string, draft: ChapterDraft): Promise<string> {
  const chapterId = await addChapter(workId, {
    chapterNumber: draft.chapterNumber,
    title: draft.title,
    coinPrice: draft.coinPrice,
    ...(draft.content !== undefined ? { content: draft.content } : { images: draft.images }),
  });
  await deleteChapterDraft(workId, draft.id);
  return chapterId;
}

/* ============================== Transfer ownership (Part 12) ============================== */

const OWNERSHIP_TRANSFERS = "ownershipTransfers";

/** Starts a transfer: looks up the recipient by @handle, writes a pending request, and notifies
 * them to accept/decline — nothing on the work itself changes until they accept. */
export async function requestOwnershipTransfer(
  workId: string,
  workTitle: string,
  fromUid: string,
  fromDisplayName: string,
  toHandle: string
): Promise<void> {
  const cleanHandle = toHandle.trim().replace(/^@/, "");
  const recipient = await getUserByHandle(cleanHandle);
  if (!recipient) throw new Error(`No account found with the handle @${cleanHandle}.`);
  if (recipient.uid === fromUid) throw new Error("You already own this series.");

  try {
    await addDoc(collection(db, OWNERSHIP_TRANSFERS), {
      workId,
      workTitle,
      fromUid,
      fromDisplayName,
      toUid: recipient.uid,
      toHandle: cleanHandle,
      status: "pending",
      createdAt: new Date().toISOString(),
    } satisfies Omit<OwnershipTransferRequest, "id">);

    await createNotification(
      recipient.uid,
      NotificationType.OWNERSHIP_TRANSFER_REQUEST,
      "Series transfer request",
      `${fromDisplayName} wants to transfer "${workTitle}" to you.`,
      "/creator",
      undefined
    );
  } catch (error) {
    await logError(error, { operation: "requestOwnershipTransfer", workId, fromUid, toHandle: cleanHandle });
    throw error;
  }
}

export async function getPendingTransfersFor(uid: string): Promise<OwnershipTransferRequest[]> {
  try {
    const q = query(
      collection(db, OWNERSHIP_TRANSFERS),
      where("toUid", "==", uid),
      where("status", "==", "pending")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OwnershipTransferRequest);
  } catch (error) {
    await logError(error, { operation: "getPendingTransfersFor", uid });
    return [];
  }
}

/** Accepting rewrites authorId/authorName/authorHandle on both creatorWorks and publishedSeries
 * (mirroring how those two collections' author fields are denormalized everywhere else in this
 * file) so every page reading either one immediately reflects the new owner. Declining just
 * closes out the request — the work is untouched either way until acceptance. */
export async function respondToOwnershipTransfer(
  requestId: string,
  accept: boolean
): Promise<void> {
  try {
    const reqSnap = await getDoc(doc(db, OWNERSHIP_TRANSFERS, requestId));
    if (!reqSnap.exists()) throw new Error("This request no longer exists.");
    const request = reqSnap.data() as OwnershipTransferRequest;

    await updateDoc(doc(db, OWNERSHIP_TRANSFERS, requestId), {
      status: accept ? "accepted" : "declined",
      respondedAt: new Date().toISOString(),
    });

    if (!accept) return;

    const recipient = await getDoc(doc(db, "users", request.toUid));
    const recipientProfile = recipient.exists() ? recipient.data() : null;
    const authorPatch = {
      authorId: request.toUid,
      authorName: recipientProfile?.displayName ?? request.toHandle,
      authorHandle: recipientProfile?.handle ?? request.toHandle,
      authorPhotoURL: recipientProfile?.photoURL,
    };

    await updateDoc(doc(db, "creatorWorks", request.workId), {
      creatorId: request.toUid,
      ...authorPatch,
    });
    const publishedSnap = await getDoc(doc(db, PUBLISHED_SERIES, request.workId));
    if (publishedSnap.exists()) {
      await updateDoc(doc(db, PUBLISHED_SERIES, request.workId), authorPatch);
    }

    await createNotification(
      request.fromUid,
      NotificationType.OWNERSHIP_TRANSFER_ACCEPTED,
      "Transfer accepted",
      `@${request.toHandle} accepted ownership of "${request.workTitle}".`,
      "/creator",
      undefined
    );
  } catch (error) {
    await logError(error, { operation: "respondToOwnershipTransfer", requestId, accept });
    throw error;
  }
}
