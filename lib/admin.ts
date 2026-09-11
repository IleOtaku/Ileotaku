/**
 * Every Firestore operation that only an admin console screen calls — user moderation/roles,
 * work review, platform stats, finance/payouts, announcements, maintenance mode, bug reports,
 * and error-log triage. Grouped into one file (mirroring how lib/payments.ts holds everything
 * money-related, lib/dms.ts everything DM-related) rather than split per admin tab, since these
 * all share the same "admin-only, writes users/works/reports/etc." shape and are only ever
 * imported from components/admin/*.
 */
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  NotificationType,
  type AdminType,
  type Announcement,
  type AnnouncementTarget,
  type Appeal,
  type AppealStatus,
  type BetaFeedbackEntry,
  type BetaFeedbackType,
  type BugReport,
  type BugReportStatus,
  type CoinTransaction,
  type ContactMessage,
  type CreatorWork,
  type EarningsRecord,
  type ErrorLogEntry,
  type ErrorLogStatus,
  type MaintenanceRequest,
  type MaintenanceState,
  type PublishedSeries,
  type Report,
  type ReportStatus,
  type ReportTargetType,
  type UserProfile,
  type WorkStatus,
} from "@/types";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getAllUsers, getUserProfile } from "./firestore";
import { createNotification } from "./notifications";
import { deleteWork, getAllPublishedSeries } from "./publishedSeries";

const USERS = "users";
const CREATOR_WORKS = "creatorWorks";

/**
 * `collectionGroup()` reads (used below for cross-user transactions/history rollups) have been
 * observed to hang indefinitely rather than resolve or reject in some environments, instead of
 * failing fast like every other query in this file — races the real query against a timeout so
 * a stuck collection-group read degrades to `fallback` (an empty stats/chart section) rather
 * than freezing the whole Overview/Finance tab forever.
 */
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = 8000): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logError(new Error("Query timed out"), { operation: "admin.withTimeout", ms });
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        logError(error, { operation: "admin.withTimeout" });
        resolve(fallback);
      }
    );
  });
}

/** getDocs() on a query, guarded by withTimeout and pre-mapped to plain docs — every
 * collection-group read in this file goes through this rather than calling getDocs directly. */
async function safeQueryDocs<T>(q: Query<DocumentData>): Promise<T[]> {
  const snap = await withTimeout<QuerySnapshot<DocumentData> | null>(getDocs(q), null);
  if (!snap) return [];
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

/* ============================== Users: roles & moderation ============================== */

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const q = query(collection(db, USERS), where("email", "==", email.trim().toLowerCase()), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].data() as UserProfile;
  // Emails aren't stored lowercased today, so also try the exact-case value the caller typed.
  const q2 = query(collection(db, USERS), where("email", "==", email.trim()), limit(1));
  const snap2 = await getDocs(q2);
  return snap2.empty ? null : (snap2.docs[0].data() as UserProfile);
}

export async function getAllAdmins(): Promise<UserProfile[]> {
  const all = await getAllUsers();
  return all.filter((u) => u.isAdmin === true);
}

async function updateUser(uid: string, patch: Partial<UserProfile>): Promise<void> {
  try {
    await updateDoc(doc(db, USERS, uid), { ...patch, updatedAt: new Date().toISOString() });
  } catch (error) {
    await logError(error, { operation: "admin.updateUser", uid, patch });
    throw error;
  }
}

export async function grantPlatinum(uid: string): Promise<void> {
  const until = new Date();
  until.setFullYear(until.getFullYear() + 1);
  await updateUser(uid, { isPlatinum: true, platinumUntil: until.toISOString() });
}

export async function revokePlatinum(uid: string): Promise<void> {
  await updateUser(uid, { isPlatinum: false });
}

export async function makeCreator(uid: string): Promise<void> {
  await updateUser(uid, { isCreator: true });
}

export async function verifyCreator(uid: string): Promise<void> {
  await updateUser(uid, { isVerified: true, verifiedType: "creator" });
  await createNotification(
    uid,
    NotificationType.BADGE_APPROVED,
    "You're verified!",
    "Your creator account has been verified — your verified badge is now live.",
    "/profile"
  );
}

/** Beta feedback: "Admin should be able to mark users as verified... and unverify them" —
 * verifyCreator()/verifyPublisher() above had no counterpart to undo a verification (e.g. a
 * badge granted in error, or a creator who's gone inactive/stopped meeting the bar). Clears both
 * the flag and the type in one write, notifying the account since losing a visible badge is worth
 * telling someone about, the same as gaining one. */
export async function unverifyUser(uid: string): Promise<void> {
  await updateUser(uid, { isVerified: false, verifiedType: null });
  await createNotification(
    uid,
    NotificationType.MODERATION_ACTION,
    "Verification removed",
    "Your verified badge has been removed by an ÍléOtaku moderator.",
    "/profile"
  );
}

export async function makePublisher(uid: string): Promise<void> {
  await updateUser(uid, { isPublisher: true });
}

export async function verifyPublisher(uid: string): Promise<void> {
  await updateUser(uid, { isVerified: true, verifiedType: "publisher" });
  await createNotification(
    uid,
    NotificationType.BADGE_APPROVED,
    "You're verified!",
    "Your publisher account has been verified — your verified badge is now live.",
    "/profile"
  );
}

export async function addAdminRole(uid: string, adminType: AdminType): Promise<void> {
  await updateUser(uid, { isAdmin: true, adminType });
}

export async function removeAdminRole(uid: string): Promise<void> {
  await updateUser(uid, { isAdmin: false, adminType: undefined });
}

/** Temporarily suspends an account and notifies the user of the exact date it lifts. */
export async function suspendUserFor(uid: string, days: number): Promise<void> {
  const until = new Date();
  until.setDate(until.getDate() + days);
  await updateUser(uid, { suspendedUntil: until.toISOString() });
  await createNotification(
    uid,
    NotificationType.MODERATION_ACTION,
    "Account suspended",
    `Your account has been suspended until ${until.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
    "/profile"
  );
}

/** Permanently bans an account and logs the email to a small audit trail (`bannedEmails`) so
 * the address stays on record even if the profile document is later modified or removed. */
export async function permanentlyBanUser(
  uid: string,
  email: string,
  bannedBy: string,
  reason?: string
): Promise<void> {
  try {
    const bannedAt = new Date().toISOString();
    await updateUser(uid, { isBanned: true, bannedAt, ...(reason ? { bannedReason: reason } : {}) });
    await setDoc(doc(db, "bannedEmails", uid), {
      uid,
      email,
      bannedBy,
      bannedAt,
      ...(reason ? { reason } : {}),
    });
  } catch (error) {
    await logError(error, { operation: "permanentlyBanUser", uid });
    throw error;
  }
}

/** Admin Users table's "Unban" action (a red/banned row) — lifts a permanent ban outright and
 * notifies the account. Distinct from an appeal's own approveAppeal() below only in copy (this
 * is a plain restriction-lifted notice, not "your appeal was approved"), since a ban can be
 * lifted either through the appeal flow or directly by an admin working the Users table. */
export async function unbanUser(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, USERS, uid), {
      isBanned: false,
      suspendedUntil: deleteField(),
      updatedAt: new Date().toISOString(),
    });
    await createNotification(
      uid,
      NotificationType.RESTRICTION_LIFTED,
      "Account restored",
      "Your account restriction has been lifted.",
      "/profile"
    );
  } catch (error) {
    await logError(error, { operation: "unbanUser", uid });
    throw error;
  }
}

/** Admin Users table's "Lift Suspension" action (a yellow/suspended row) — clears a temporary
 * suspension before it would have expired on its own. */
export async function liftSuspension(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, USERS, uid), {
      suspendedUntil: deleteField(),
      updatedAt: new Date().toISOString(),
    });
    await createNotification(
      uid,
      NotificationType.RESTRICTION_LIFTED,
      "Suspension lifted",
      "Your account restriction has been lifted.",
      "/profile"
    );
  } catch (error) {
    await logError(error, { operation: "liftSuspension", uid });
    throw error;
  }
}

/* ============================== Ban appeals (Part 5) ============================== */

const APPEALS = "appeals";

/** Every submitted appeal, newest first — powers the Super Admin dashboard's Appeals tab. */
export async function getAppeals(): Promise<Appeal[]> {
  try {
    const q = query(collection(db, APPEALS), orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Appeal);
  } catch (error) {
    await logError(error, { operation: "getAppeals" });
    return [];
  }
}

/** Real-time count of still-pending appeals, for the Appeals tab's unread badge. */
export function subscribeToPendingAppealCount(callback: (count: number) => void): Unsubscribe {
  const q = query(collection(db, APPEALS), where("status", "==", "pending"));
  return onSnapshot(q, (snap) => callback(snap.size), () => callback(0));
}

async function resolveAppeal(appealId: string, uid: string, status: AppealStatus, adminUid: string): Promise<void> {
  await updateDoc(doc(db, APPEALS, appealId), {
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy: adminUid,
  });
  if (status === "approved") {
    await updateDoc(doc(db, USERS, uid), {
      isBanned: false,
      suspendedUntil: deleteField(),
      updatedAt: new Date().toISOString(),
    });
    await createNotification(
      uid,
      NotificationType.APPEAL_APPROVED,
      "Appeal approved",
      "Your appeal was approved — welcome back!",
      "/profile"
    );
  } else {
    await createNotification(
      uid,
      NotificationType.APPEAL_DENIED,
      "Appeal reviewed",
      "Your appeal was reviewed and denied.",
      "/banned"
    );
  }
}

/** Approves a ban appeal: unbans the account (clearing both isBanned and any lingering
 * suspension) and notifies them. */
export async function approveAppeal(appealId: string, uid: string, adminUid: string): Promise<void> {
  try {
    await resolveAppeal(appealId, uid, "approved", adminUid);
  } catch (error) {
    await logError(error, { operation: "approveAppeal", appealId, uid });
    throw error;
  }
}

/** Denies a ban appeal: the ban stays in place, the account is notified of the outcome. */
export async function denyAppeal(appealId: string, uid: string, adminUid: string): Promise<void> {
  try {
    await resolveAppeal(appealId, uid, "denied", adminUid);
  } catch (error) {
    await logError(error, { operation: "denyAppeal", appealId, uid });
    throw error;
  }
}

/**
 * SUPERSEDED by adminDeleteUserAccount() below, which also removes the Firebase Auth account via
 * app/api/admin/delete-user/route.ts's Admin SDK call. Kept only as the Firestore-only half that
 * route's own cleanup logic mirrors; the admin Users table calls adminDeleteUserAccount(), not
 * this, for its "Delete Account" action.
 *
 * Erases an account's Firestore data — mirrors lib/auth.ts's deleteMyAccount pipeline (every
 * subcollection, their creatorFeed posts, then the profile doc itself) but for an admin acting
 * on SOMEONE ELSE's account.
 *
 * IMPORTANT LIMITATION: this does NOT delete the person's Firebase Auth account — the client SDK
 * can only ever call deleteUser() on whichever account is CURRENTLY signed into this browser
 * session. That's exactly the gap adminDeleteUserAccount()'s server route closes.
 */
export async function adminDeleteUserData(uid: string): Promise<void> {
  const USER_SUBCOLLECTIONS = [
    "notifications",
    "history",
    "transactions",
    "unlocked",
    "blocked",
    "readingActivity",
  ];
  try {
    await Promise.all(
      USER_SUBCOLLECTIONS.map(async (name) => {
        const snap = await getDocs(collection(db, USERS, uid, name));
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      })
    );

    const postsSnap = await getDocs(query(collection(db, "creatorFeed"), where("uid", "==", uid)));
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, USERS, uid));
  } catch (error) {
    await logError(error, { operation: "adminDeleteUserData", uid });
    throw error;
  }
}

/**
 * Deletes a user's account entirely — Firebase Auth credential included — via
 * app/api/admin/delete-user/route.ts's server-side Admin SDK call. This is the real fix for
 * adminDeleteUserData()'s limitation: the person can no longer sign back in at all, not just
 * land on a freshly-recreated blank profile.
 */
export async function adminDeleteUserAccount(targetUid: string, adminUid: string): Promise<void> {
  const res = await fetch("/api/admin/delete-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUid, adminUid }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.error ?? "Couldn't delete this account.");
    await logError(error, { operation: "adminDeleteUserAccount", targetUid, adminUid, status: res.status });
    throw error;
  }
}

/* ============================== Works: review queue ============================== */

export async function getWorksByStatus(status: WorkStatus): Promise<CreatorWork[]> {
  const q = query(collection(db, CREATOR_WORKS), where("status", "==", status));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CreatorWork)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** One creatorWorks doc by id — the source-of-truth submission record behind a publishedSeries
 * summary, used by the admin Approved tab to show a "Submitted" date (creatorWorks.createdAt)
 * and revenue (creatorWorks.earnings) that publishedSeries doesn't itself carry. */
export async function getCreatorWorkById(workId: string): Promise<CreatorWork | null> {
  try {
    const snap = await getDoc(doc(db, CREATOR_WORKS, workId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CreatorWork) : null;
  } catch (error) {
    await logError(error, { operation: "getCreatorWorkById", workId });
    return null;
  }
}

/**
 * Sprint "Polish-2" Part 2 fix: the admin Works panel's Approved tab used to query
 * `creatorWorks` where `status == "approved"` — a value approveWork() never actually writes,
 * since it promotes a submission straight from "pending" to "published" in one step (see
 * approveWork's own doc comment). That query always came back empty, which was the reported bug.
 * Every doc that exists in `publishedSeries` IS, by definition, a published/approved work (that
 * collection carries no separate status field of its own — existence in it is the signal), so
 * this is the query the Approved tab should actually run.
 */
export async function getApprovedSeriesForAdmin(): Promise<PublishedSeries[]> {
  return getAllPublishedSeries(300, { includeHidden: true });
}

/** Suspend/Restore (Part 2's Review Series panel) — `isHidden` is checked by every reader-facing
 * publishedSeries query the same way a draft chapter is: Explore/Browse/search all read from this
 * same collection, so setting it hides a series from all of them immediately without touching its
 * chapters or reader-owned unlock records. */
export async function suspendSeries(workId: string): Promise<void> {
  await updateDoc(doc(db, "publishedSeries", workId), { isHidden: true });
}

export async function restoreSeries(workId: string): Promise<void> {
  await updateDoc(doc(db, "publishedSeries", workId), { isHidden: false });
}

/** Admin's "Delete Series" — the same underlying cleanup the creator's own DeleteWorkModal uses
 * (deleteWork: every chapter doc, the publishedSeries summary, and the creatorWorks doc), plus a
 * notification to the creator since this time it wasn't their own decision. */
export async function adminDeleteSeries(series: PublishedSeries): Promise<void> {
  await deleteWork(series.id);
  await createNotification(
    series.authorId,
    NotificationType.MODERATION_ACTION,
    "Series removed",
    `"${series.title}" was removed by an ÍléOtaku moderator for violating platform guidelines.`,
    "/creator"
  ).catch(() => {});
}

/**
 * Approving a work does three things in one pass, all at once rather than "approved" now and
 * "published" some later step — Sprint 9f folded the two into a single admin action since
 * nothing in this codebase ever moves a work from "approved" to "published" separately:
 *   1. Promotes the creatorWorks doc straight to status "published", filling in every field the
 *      public-facing surfaces (Explore, /manga/[id], /creator/[handle]'s Works tab, the reader)
 *      need and that submitWork() never collected (denormalized author info, zero-initialized
 *      stat counters, and reasonable catalog defaults for format/language/contentRating).
 *   2. Mirrors a public summary to publishedSeries/{workId} — the collection those surfaces
 *      actually query, kept separate from creatorWorks so a rejected/pending work never needs to
 *      be publicly readable.
 *   3. Generates a copyright certificate (see /creator/certificate/[certId]) and stores it on
 *      both documents.
 */
export async function approveWork(workId: string, creatorId: string, title: string): Promise<void> {
  try {
    const [workSnap, creator] = await Promise.all([
      getDoc(doc(db, CREATOR_WORKS, workId)),
      getUserProfile(creatorId),
    ]);
    const work = workSnap.exists() ? (workSnap.data() as CreatorWork) : null;

    const now = new Date().toISOString();
    const certId = crypto.randomUUID();
    const registrationNumber = `ILO-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const authorName = creator?.displayName ?? "ÍléOtaku Creator";
    const authorVerified = creator?.isVerified === true || creator?.verified === true;
    const coverImage = work?.coverURL ?? "";
    const genres = work?.genres ?? [];
    const format = work?.format ?? "manga";
    const language = work?.language ?? "English";
    const contentRating = work?.contentRating ?? "Teen";
    const updateSchedule = work?.updateSchedule ?? "Weekly";
    // Firestore rejects `undefined` field values outright — never spread these in directly, only
    // include a handle/photo key at all once there's a real value to put there.
    const authorHandle = creator?.handle ? { authorHandle: creator.handle } : {};
    const authorPhotoURL = creator?.photoURL ? { authorPhotoURL: creator.photoURL } : {};

    const publishFields = {
      status: "published" as WorkStatus,
      publishedAt: now,
      updatedAt: now,
      authorName,
      ...authorHandle,
      ...authorPhotoURL,
      authorVerified,
      seriesId: workId,
      coverImage,
      genres,
      totalReads: 0,
      totalBookmarks: 0,
      averageRating: 0,
      format,
      language,
      contentRating,
      updateSchedule,
      chapterCount: 0,
      certId,
      issuedAt: now,
      registrationNumber,
    };

    // A single batch, not two sequential awaits — the creatorWorks promotion and the public
    // publishedSeries summary must land together or not at all. Two independent writes here
    // left a real gap during testing: an interruption between them (a closed tab, a dropped
    // connection) left a work showing "published" with a certificate id on its own creatorWorks
    // doc, but no publishedSeries doc at all — invisible on Explore/the creator profile, and its
    // "certificate" a 404.
    const batch = writeBatch(db);
    batch.update(doc(db, CREATOR_WORKS, workId), publishFields);
    batch.set(doc(db, "publishedSeries", workId), {
      authorId: creatorId,
      authorName,
      ...authorHandle,
      ...authorPhotoURL,
      authorVerified,
      title: work?.title ?? title,
      description: work?.description ?? "",
      coverImage,
      genres,
      source: "creator",
      format,
      language,
      contentRating,
      updateSchedule,
      totalReads: 0,
      totalBookmarks: 0,
      averageRating: 0,
      chapterCount: 0,
      totalWordCount: 0,
      isFeatured: false,
      publishedAt: now,
      certId,
      issuedAt: now,
      registrationNumber,
    });
    await batch.commit();

    await createNotification(
      creatorId,
      NotificationType.WORK_APPROVED,
      "Your work was approved!",
      `"${title}" has been approved and is now live.`,
      "/creator",
      publishFields.coverImage || undefined
    );
  } catch (error) {
    await logError(error, { operation: "approveWork", workId });
    throw error;
  }
}

export async function rejectWork(
  workId: string,
  creatorId: string,
  title: string,
  reason: string
): Promise<void> {
  try {
    await updateDoc(doc(db, CREATOR_WORKS, workId), {
      status: "rejected",
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    });
    await createNotification(
      creatorId,
      NotificationType.WORK_REJECTED,
      "Your work needs changes",
      `"${title}" wasn't approved: ${reason}`,
      "/creator"
    );
  } catch (error) {
    await logError(error, { operation: "rejectWork", workId });
    throw error;
  }
}

/** Leaves the work in the pending queue but attaches a note asking the creator to revise it —
 * distinct from rejectWork(), which moves the work out of the active queue entirely. */
export async function requestWorkChanges(
  workId: string,
  creatorId: string,
  title: string,
  note: string
): Promise<void> {
  try {
    await updateDoc(doc(db, CREATOR_WORKS, workId), {
      rejectionReason: note,
      updatedAt: new Date().toISOString(),
    });
    await createNotification(
      creatorId,
      NotificationType.WORK_REJECTED,
      "Changes requested on your work",
      `A moderator asked for changes on "${title}": ${note}`,
      "/creator"
    );
  } catch (error) {
    await logError(error, { operation: "requestWorkChanges", workId });
    throw error;
  }
}

/** Sends a rejected work back to the pending queue for another look. */
export async function resubmitWorkForReview(workId: string): Promise<void> {
  await updateDoc(doc(db, CREATOR_WORKS, workId), {
    status: "pending",
    updatedAt: new Date().toISOString(),
  });
}

export async function toggleWorkFlags(
  workId: string,
  flags: Partial<Pick<CreatorWork, "isFeatured" | "isAfricanOriginal">>
): Promise<void> {
  await updateDoc(doc(db, CREATOR_WORKS, workId), { ...flags, updatedAt: new Date().toISOString() });
  // isFeatured is also mirrored onto publishedSeries (when the work has one) so Explore's
  // "Featured Creator Works" rail can query it directly without read access to creatorWorks.
  if ("isFeatured" in flags) {
    await updateDoc(doc(db, "publishedSeries", workId), { isFeatured: flags.isFeatured }).catch(() => {});
  }
}

/* ============================== Reports: filtered queue ============================== */

export interface ReportFilter {
  targetType?: ReportTargetType;
  status?: ReportStatus;
}

/** Broader than firestore.ts's getPendingReports() (which is always status=="pending") — this
 * powers the Reports tab's targetType/status filter controls. */
export async function getReports(filter: ReportFilter = {}): Promise<Report[]> {
  const clauses = [];
  if (filter.targetType) clauses.push(where("targetType", "==", filter.targetType));
  if (filter.status) clauses.push(where("status", "==", filter.status));
  const q = clauses.length > 0 ? query(collection(db, "reports"), ...clauses) : collection(db, "reports");
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Report)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ============================== Overview stats ============================== */

export interface AdminOverviewStats {
  totalUsers: number;
  platinumUsers: number;
  activeCreators: number;
  publishers: number;
  pendingReviews: number;
  openReports: number;
  revenueThisMonthNGN: number;
  todaySignups: number;
}

function monthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7); // "YYYY-MM"
}

function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** One query per collection/collectionGroup, all fetched in parallel — fine at this app's
 * scale (same wholesale-fetch-then-aggregate pattern the rest of the app already uses). */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const [users, pendingWorks, openReportsSnap, transactions] = await Promise.all([
    getAllUsers(),
    getWorksByStatus("pending"),
    getDocs(query(collection(db, "reports"), where("status", "==", "pending"))),
    safeQueryDocs<CoinTransaction>(collectionGroup(db, "transactions")),
  ]);

  const today = dayKey();
  const thisMonth = monthKey();

  const revenueThisMonthNGN = transactions.reduce((sum, tx) => {
    if (!tx.amountNGN || !tx.createdAt.startsWith(thisMonth)) return sum;
    return sum + tx.amountNGN;
  }, 0);

  return {
    totalUsers: users.length,
    platinumUsers: users.filter((u) => u.isPlatinum).length,
    activeCreators: users.filter((u) => u.isCreator).length,
    publishers: users.filter((u) => u.isPublisher).length,
    pendingReviews: pendingWorks.length,
    openReports: openReportsSnap.size,
    revenueThisMonthNGN,
    todaySignups: users.filter((u) => u.createdAt?.startsWith(today)).length,
  };
}

export interface DailyRevenuePoint {
  date: string;
  coinsNGN: number;
  platinumNGN: number;
}

/** Last 7 calendar days (oldest first) of coin-sale vs Platinum-subscription revenue, read
 * from every user's transactions subcollection via a collectionGroup query. */
export async function getRevenueLast7Days(): Promise<DailyRevenuePoint[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  cutoff.setHours(0, 0, 0, 0);

  const q = query(collectionGroup(db, "transactions"), where("createdAt", ">=", cutoff.toISOString()));
  const transactions = await safeQueryDocs<CoinTransaction>(q);

  const byDay = new Map<string, DailyRevenuePoint>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(cutoff);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    byDay.set(key, { date: key, coinsNGN: 0, platinumNGN: 0 });
  }

  transactions.forEach((tx) => {
    if (!tx.amountNGN) return;
    const key = tx.createdAt.slice(0, 10);
    const point = byDay.get(key);
    if (!point) return;
    if (tx.category === "platinum") point.platinumNGN += tx.amountNGN;
    else if (tx.category === "coins") point.coinsNGN += tx.amountNGN;
  });

  return Array.from(byDay.values());
}

export interface TopSeriesEntry {
  mangaId: string;
  title: string;
  reads: number;
}

/** Top series by read events this week, aggregated from every user's `history` subcollection
 * (one entry per chapter read) via a collectionGroup query rather than a denormalized counter,
 * since no per-series counter is maintained anywhere else in the data model. */
export async function getTopSeriesByReadsThisWeek(take = 5): Promise<TopSeriesEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const q = query(collectionGroup(db, "history"), where("readAt", ">=", cutoff.toISOString()));
  const entries = await safeQueryDocs<{ mangaId: string; title: string }>(q);

  const byManga = new Map<string, TopSeriesEntry>();
  entries.forEach((entry) => {
    const existing = byManga.get(entry.mangaId);
    if (existing) existing.reads += 1;
    else byManga.set(entry.mangaId, { mangaId: entry.mangaId, title: entry.title, reads: 1 });
  });

  return Array.from(byManga.values())
    .sort((a, b) => b.reads - a.reads)
    .slice(0, take);
}

export interface TopCreatorEntry {
  creatorId: string;
  creatorName: string;
  amount: number;
}

/** Top earners for the current month, from the `earnings` payout ledger (see Finance section
 * below) — empty until payout records exist for the month, rather than approximated from
 * lifetime CreatorWork.earnings totals, which carry no month boundary at all. */
export async function getTopCreatorsByEarningsThisMonth(take = 5): Promise<TopCreatorEntry[]> {
  const q = query(collection(db, "earnings"), where("period", "==", monthKey()));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as EarningsRecord)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, take)
    .map((e) => ({ creatorId: e.creatorId, creatorName: e.creatorName, amount: e.amount }));
}

export async function getRecentSignups(take = 10): Promise<UserProfile[]> {
  const users = await getAllUsers();
  return users.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, take);
}

/* ============================== Finance ============================== */

export interface FinanceSummary {
  totalAllTimeNGN: number;
  totalThisMonthNGN: number;
  totalLastMonthNGN: number;
  percentChange: number;
  coinsNGN: number;
  platinumNGN: number;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const transactions = await safeQueryDocs<CoinTransaction>(collectionGroup(db, "transactions"));
  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonthDate = new Date(now);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = monthKey(lastMonthDate);

  let totalAllTimeNGN = 0;
  let totalThisMonthNGN = 0;
  let totalLastMonthNGN = 0;
  let coinsNGN = 0;
  let platinumNGN = 0;

  transactions.forEach((tx) => {
    if (!tx.amountNGN) return;
    totalAllTimeNGN += tx.amountNGN;
    if (tx.createdAt.startsWith(thisMonth)) totalThisMonthNGN += tx.amountNGN;
    if (tx.createdAt.startsWith(lastMonth)) totalLastMonthNGN += tx.amountNGN;
    if (tx.category === "coins") coinsNGN += tx.amountNGN;
    else if (tx.category === "platinum") platinumNGN += tx.amountNGN;
  });

  const percentChange =
    totalLastMonthNGN === 0
      ? totalThisMonthNGN > 0
        ? 100
        : 0
      : Math.round(((totalThisMonthNGN - totalLastMonthNGN) / totalLastMonthNGN) * 100);

  return { totalAllTimeNGN, totalThisMonthNGN, totalLastMonthNGN, percentChange, coinsNGN, platinumNGN };
}

export interface TransactionLogEntry extends CoinTransaction {
  userEmail?: string;
}

/** Last `take` real-money transactions across every user, newest first, with the paying
 * user's email resolved in for display — used by the Finance tab's transaction log + CSV export. */
export async function getRecentTransactions(take = 50): Promise<TransactionLogEntry[]> {
  const q = query(collectionGroup(db, "transactions"), orderBy("createdAt", "desc"), limit(take));
  const txs = await safeQueryDocs<CoinTransaction>(q);

  const uniqueUserIds = Array.from(new Set(txs.map((t) => t.userId)));
  const profiles = await Promise.all(uniqueUserIds.map((uid) => getUserProfile(uid)));
  const emailByUid = new Map(uniqueUserIds.map((uid, i) => [uid, profiles[i]?.email]));

  return txs.map((t) => ({ ...t, userEmail: emailByUid.get(t.userId) }));
}

export async function getPendingPayouts(): Promise<EarningsRecord[]> {
  const q = query(collection(db, "earnings"), where("payoutStatus", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EarningsRecord);
}

export async function markPayoutPaid(earningId: string): Promise<void> {
  await updateDoc(doc(db, "earnings", earningId), {
    payoutStatus: "paid",
    paidAt: new Date().toISOString(),
  });
}

/** Builds a CSV string from the transaction log — used by the Finance tab's Export CSV button. */
export function transactionsToCsv(transactions: TransactionLogEntry[]): string {
  const header = ["Date", "Type", "Category", "Amount (NGN)", "User Email", "Paystack Reference", "Description"];
  const rows = transactions.map((t) => [
    t.createdAt,
    t.type,
    t.category ?? "",
    t.amountNGN?.toString() ?? "",
    t.userEmail ?? "",
    t.paystackRef ?? "",
    `"${t.description.replace(/"/g, '""')}"`,
  ]);
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

/* ============================== Announcements ============================== */

const NOTIFY_BATCH_SIZE = 500;

async function targetedUserIds(target: AnnouncementTarget): Promise<{ uid: string }[]> {
  let clause;
  if (target === "platinum") clause = where("isPlatinum", "==", true);
  else if (target === "creators") clause = where("isCreator", "==", true);
  else if (target === "publishers") clause = where("isPublisher", "==", true);

  const q = clause ? query(collection(db, USERS), clause) : collection(db, USERS);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id }));
}

/**
 * Writes the announcement doc, then fans out an ANNOUNCEMENT notification to every targeted
 * user in batches of 500 (Firestore's own batch-write limit) via `onProgress` so the caller
 * can show a "Sending to N users..." indicator. Returns the final recipient count.
 */
export async function sendAnnouncement(
  input: Omit<Announcement, "id" | "createdAt" | "recipientCount">,
  onProgress?: (sent: number, total: number) => void
): Promise<number> {
  const recipients = await targetedUserIds(input.target);
  const total = recipients.length;

  for (let i = 0; i < recipients.length; i += NOTIFY_BATCH_SIZE) {
    const chunk = recipients.slice(i, i + NOTIFY_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ uid }) => {
      const ref = doc(collection(db, USERS, uid, "notifications"));
      batch.set(ref, {
        type: NotificationType.ANNOUNCEMENT,
        title: input.title,
        body: input.body,
        actionURL: "/",
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    onProgress?.(Math.min(i + NOTIFY_BATCH_SIZE, total), total);
  }

  await addDoc(collection(db, "announcements"), {
    ...input,
    recipientCount: total,
    createdAt: new Date().toISOString(),
  });

  return total;
}

export async function getAnnouncements(take = 20): Promise<Announcement[]> {
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(take));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Announcement);
}

/* ============================== Maintenance mode ============================== */

const MAINTENANCE_DOC = "maintenance/current";

export async function submitMaintenanceRequest(
  input: Omit<MaintenanceRequest, "id" | "status" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "maintenanceRequests"), {
    ...input,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
}

export async function getMaintenanceRequests(status?: MaintenanceRequest["status"]): Promise<MaintenanceRequest[]> {
  const q = status
    ? query(collection(db, "maintenanceRequests"), where("status", "==", status))
    : collection(db, "maintenanceRequests");
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as MaintenanceRequest)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Approves a pending request and activates it as the live maintenance window immediately —
 * MaintenanceGate reads this same maintenance/current doc in real time. */
export async function approveMaintenanceRequest(request: MaintenanceRequest): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", request.id), { status: "approved" });
  await setDoc(doc(db, MAINTENANCE_DOC), {
    isActive: true,
    startTime: request.startTime,
    endTime: request.endTime,
    reason: request.reason,
    affectedSystems: request.affectedSystems,
  } satisfies MaintenanceState);
}

export async function rejectMaintenanceRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, "maintenanceRequests", requestId), { status: "rejected" });
}

/** Ends the active maintenance window immediately (used by the "Deactivate" toggle). */
export async function deactivateMaintenance(): Promise<void> {
  await setDoc(doc(db, MAINTENANCE_DOC), { isActive: false } satisfies Partial<MaintenanceState>, {
    merge: true,
  });
}

export async function getMaintenanceState(): Promise<MaintenanceState | null> {
  const snap = await getDoc(doc(db, MAINTENANCE_DOC));
  return snap.exists() ? (snap.data() as MaintenanceState) : null;
}

/** Real-time subscription MaintenanceGate uses to show/hide the full-screen maintenance page
 * without a refresh the moment an admin activates or ends a window. */
export function subscribeToMaintenanceState(
  callback: (state: MaintenanceState | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, MAINTENANCE_DOC),
    (snap) => callback(snap.exists() ? (snap.data() as MaintenanceState) : null),
    () => callback(null)
  );
}

/* ============================== Bug reports ============================== */

export async function submitBugReport(
  input: Omit<BugReport, "id" | "status" | "createdAt" | "updatedAt">
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, "bugReports"), {
    ...input,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
}

export async function getBugReports(status?: BugReportStatus): Promise<BugReport[]> {
  const q = status
    ? query(collection(db, "bugReports"), where("status", "==", status))
    : collection(db, "bugReports");
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as BugReport)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** A user's own submitted bug reports, newest first — shown on their profile's Settings tab
 * so they can see any technical-team note left in response. */
export async function getMyBugReports(uid: string): Promise<BugReport[]> {
  const q = query(collection(db, "bugReports"), where("reportedBy", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as BugReport)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function updateBugReportStatus(bugId: string, status: BugReportStatus): Promise<void> {
  await updateDoc(doc(db, "bugReports", bugId), { status, updatedAt: new Date().toISOString() });
}

export async function addBugReportNote(bugId: string, note: string): Promise<void> {
  await updateDoc(doc(db, "bugReports", bugId), { note, updatedAt: new Date().toISOString() });
}

/* ============================== Contact messages ============================== */

export async function submitContactMessage(
  input: Omit<ContactMessage, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "contactMessages"), {
    ...input,
    createdAt: new Date().toISOString(),
  });
}

/* ============================== Beta feedback ============================== */

/** Writes one entry from the floating Beta Feedback button — works for signed-out visitors too
 * (firestore.rules allows create unconditionally), same shape as submitBugReport/
 * submitContactMessage above. */
export async function createFeedback(input: {
  type: BetaFeedbackType;
  description: string;
  page: string;
  uid: string | null;
  email: string | null;
}): Promise<void> {
  await addDoc(collection(db, "betaFeedback"), {
    ...input,
    createdAt: new Date().toISOString(),
    resolved: false,
  });
}

export async function getFeedback(): Promise<BetaFeedbackEntry[]> {
  const snap = await getDocs(collection(db, "betaFeedback"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as BetaFeedbackEntry)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function markFeedbackResolved(feedbackId: string): Promise<void> {
  await updateDoc(doc(db, "betaFeedback", feedbackId), { resolved: true });
}

/* ============================== Error logs ============================== */

export async function getErrorLogs(status?: ErrorLogStatus): Promise<ErrorLogEntry[]> {
  const q = status
    ? query(collection(db, "errors"), where("status", "==", status))
    : collection(db, "errors");
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ErrorLogEntry)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function resolveErrorLog(errorId: string): Promise<void> {
  await updateDoc(doc(db, "errors", errorId), { status: "resolved" });
}
