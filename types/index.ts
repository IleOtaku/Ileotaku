export type SubscriptionTier = "free" | "plus" | "platinum";

export type UserRole = "reader" | "creator" | "admin";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  bio?: string;
  role: UserRole;
  tier: SubscriptionTier;
  coins: number;
  favorites: string[];
  following: string[];
  /** UIDs of users who follow this profile — the inverse edge of `following`. */
  followers?: string[];
  /** Public @handle used for the /creator/[handle] profile route. */
  handle?: string;
  /** Lowercased mirrors of `handle`/`displayName`, kept in sync on every profile save — powers
   * client-side substring search (Firestore has no native "contains" query). */
  handleLower?: string;
  displayNameLower?: string;
  /** A publishing house/studio account, as distinct from an individual creator — changes the
   * verified-badge color (purple vs blue) wherever badges are shown. */
  isPublisher?: boolean;
  /** Flags mirrored onto the profile doc so security rules and UI can check them directly. */
  isCreator?: boolean;
  isAdmin?: boolean;
  isPlatinum?: boolean;
  /** ISO date the current Platinum subscription (if any) is active until. */
  platinumUntil?: string;
  /** Blue checkmark for verified creators. */
  verified?: boolean;
  /** Badge for creators who joined during ÍléOtaku's founding cohort. */
  foundingCreator?: boolean;
  /** Manga/series IDs the user has saved to their personal library. */
  readingList?: string[];
  /** Per-manga last-read position, keyed by manga id — powers the profile's "Currently Reading" grid. */
  readingProgress?: Record<string, ReadingProgressEntry>;
  /** Total chapters read across all series — a simple lifetime counter. */
  chaptersRead?: number;
  /** ISO date of the last chapter read. */
  lastReadAt?: string;
  /** IDs of unlocked achievements (see lib/achievements.ts for the full catalog). */
  achievements?: string[];
  favoriteGenre?: string;
  preferences?: ReadingPreferences;
  notifications?: NotificationPreferences;
  /** Which admin console a staff account sees — only meaningful when isAdmin is true. */
  adminType?: AdminType;
  /** Which Platinum plan is active — only meaningful when isPlatinum is true. */
  platinumTier?: PlatinumTier;
  /** Date-only string ("YYYY-MM-DD") of the last daily-roulette spin, for the once-a-day gate. */
  lastRouletteSpin?: string;
  /** Date-only strings ("YYYY-MM-DD") marking each day the user read something, for the streak. */
  streakDays?: string[];
  /** How many people signed up using this user's referral link. */
  referralCount?: number;
  /** Total coins earned from referrals. */
  referralCoins?: number;
  /** Blue checkmark distinct from `verified` (founding-cohort creators) — general trust badge
   * shown next to a display name in comments and elsewhere. */
  isVerified?: boolean;
  /** Which kind of account `isVerified` badge represents — changes badge color (blue vs purple)
   * and copy wherever it's shown. Only meaningful when isVerified is true. */
  verifiedType?: "creator" | "publisher";
  /** Count of moderation strikes from actioned reports — feeds account-suspension logic. */
  strikeCount?: number;
  /** ISO date the account is suspended until, if a moderator has taken that action. */
  suspendedUntil?: string;
  /** Set by a Permanent Ban moderation action. A banned account is not deleted, just locked out. */
  isBanned?: boolean;
  /** When/why a Permanent Ban was applied — set alongside isBanned, kept even if it's later
   * lifted so the account's moderation history isn't lost. */
  bannedAt?: string;
  bannedReason?: string;
  /** Preset id for the profile cover banner's background — see COVER_STYLES in
   * components/profile/CoverStylePicker.tsx for the six available options. */
  coverStyle?: CoverStyleId;
  /** Two-letter (or short) country/region label shown on the public creator profile's About tab. */
  country?: string;
  socialLinks?: SocialLinks;
  /** FCM registration tokens for this device/browser (one user may have several across
   * devices) — used by the notification-sending Cloud Function to deliver push notifications. */
  fcmTokens?: string[];
  /** Denormalized mirror of whether `users/{uid}/spotifyAuth` exists (Sprint 9d's real
   * Authorization Code OAuth connection) — kept on the profile so any page checking "is this
   * user's Spotify connected" (NowPlayingCard, SpotifyMiniPlayer, the manga/creator pages) can
   * read it off the profile they already fetched instead of a second Firestore round-trip. Set
   * true by the OAuth callback page, cleared by disconnectSpotify(). */
  spotifyConnected?: boolean;
  /** Opt-out for showing this user's Now Playing status to others — defaults to visible
   * (`undefined`/`true`) when connected; only an explicit `false` hides it. */
  showNowPlaying?: boolean;

  /* ---------------------------- Sprint 9e: reading activity sharing ---------------------------- */

  /** Master on/off for sharing reading activity at all — defaults to visible (`undefined`/`true`)
   * for every account, free or Platinum; only an explicit `false` opts out entirely. */
  showReadingActivity?: boolean;
  /** Who can see it when `showReadingActivity` is on. Free accounts are hard-locked to
   * "everyone" by every read site in this codebase (see lib/readingActivity.ts) regardless of
   * what this field holds — "followers"/"nobody" only take effect for `isPlatinum` accounts. */
  readingActivityVisibility?: "everyone" | "followers" | "nobody";

  /* ---------------------------- Sprint 9e: Platinum perks ---------------------------- */

  /** One-line tagline shown under the handle on this user's own profile — Platinum-exclusive,
   * max 40 characters (enforced at save time in SettingsTab). */
  platinumTagline?: string;
  /** "HH:mm" 24-hour local time-of-day for the daily reading-reminder push notification —
   * Platinum-exclusive. Absent/undefined means no reminder is scheduled. */
  reminderTime?: string;

  /* ---------------------------- Sprint 9d: inactivity auto-deletion ---------------------------- */

  /** Months of inactivity before the account is auto-deleted, or "never" to opt out entirely.
   * Read as 6 wherever a profile predates this field (see the Settings tab and
   * scripts/check-inactive-accounts.js, which both apply that same default explicitly rather
   * than relying on Firestore to have written it). */
  inactivityDeleteAfter?: 1 | 3 | 6 | 8 | 12 | "never";
  /** ISO date string (this codebase's date convention throughout — see `createdAt`/`updatedAt`
   * below) of the most recent significant action: sign-in, profile edit, chapter read, post,
   * DM, or comment. upsertUserProfile() stamps this on every write; a handful of call sites that
   * don't otherwise touch the profile call updateLastActive() directly (see lib/firestore.ts). */
  lastActiveAt?: string;
  /** Whether the 2-weeks-before-deletion warning email has already gone out for the *current*
   * inactivity countdown — reset to false the next time lastActiveAt advances, so a user who
   * logs back in and later goes inactive again gets warned again. */
  deletionWarningEmailSent?: boolean;
  /** ISO date string the account is actually scheduled to be deleted, set when the warning email
   * goes out (now + 14 days) — null until then. */
  scheduledDeletionAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

export type CoverStyleId = "default" | "clay" | "gold" | "green" | "plat" | "purple";

export interface SocialLinks {
  twitter?: string;
  instagram?: string;
  website?: string;
}

export type PlatinumTier = "monthly" | "annual" | "student" | "family";

export interface ReadingProgressEntry {
  title: string;
  coverURL: string;
  chapterIndex: number;
  chapterLabel: string;
  totalChapters: number;
  progress: number;
  updatedAt: string;
  /** Prose only — which paragraph (0-based) the reader last scrolled to within `chapterIndex`,
   * so resuming a prose chapter can restore mid-chapter position rather than just the chapter. */
  paragraphIndex?: number;
}

/** "light" predates Sprint 9e's 5-theme lineup and is kept only so old saved preferences don't
 * break the type — the theme picker (Settings + reader toolbar) never offers it as a choice
 * anymore, having effectively been superseded by "sepia" for the same "less contrast than dark"
 * role. Dark and Sepia are free; Midnight/Sakura/Matrix are Platinum-exclusive. */
export type ReaderTheme = "dark" | "sepia" | "light" | "midnight" | "sakura" | "matrix";
export const FREE_READER_THEMES: ReaderTheme[] = ["dark", "sepia"];
export const PLATINUM_READER_THEMES: ReaderTheme[] = ["midnight", "sakura", "matrix"];

export interface ReadingPreferences {
  mode: "scroll" | "paged";
  theme: ReaderTheme;
  autoload: boolean;
  showProgressBar: boolean;
}

export interface NotificationPreferences {
  chapterAlerts: boolean;
  announcements: boolean;
}

export type AdminType = "super" | "sub" | "accountant" | "technical" | "community";

export interface Manga {
  id: string;
  title: string;
  slug: string;
  coverURL: string;
  synopsis: string;
  genres: string[];
  status: "ongoing" | "completed" | "hiatus";
  authorId: string;
  authorName: string;
  rating: number;
  views: number;
  isPlatinum: boolean;
  chapterCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface MangaDetail extends Manga {
  chapters: Chapter[];
  relatedMangaIds: string[];
  totalLikes: number;
  totalComments: number;
}

export interface Chapter {
  id: string;
  mangaId: string;
  number: number;
  title: string;
  pages: string[];
  isPlatinum: boolean;
  coinPrice?: number;
  releasedAt: string;
  views: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  /** Denormalized onto the message at send-time so the chat UI can show the ✦ badge without a lookup. */
  senderIsPlatinum?: boolean;
  text: string;
  createdAt: string;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type WorkStatus = "pending" | "approved" | "published" | "rejected";

/** A creator work's content type. "prose" (Part 2's Wattpad-style stories) reads its chapters as
 * plain text rather than image pages — see PublishedChapter's `content`/`wordCount` fields and
 * app/story/[workId]/page.tsx, its dedicated reader. Everything else still reads through
 * /manga/[id] and app/reader's image-page viewer. */
export type WorkFormat = "manga" | "manhwa" | "manhua" | "prose";

export interface CreatorWork {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  coverURL: string;
  genres: string[];
  status: WorkStatus;
  views: number;
  earnings: number;
  /** Set on an approved work to pin it in featured rails across the site. */
  isFeatured?: boolean;
  /** Flags a work as an original African-creator title (vs. licensed/aggregated content) for
   * the "🌍" badges and African-original filters shown elsewhere in the catalog. */
  isAfricanOriginal?: boolean;
  /** Moderator's written reason, set when status is "rejected" — shown back to the creator and
   * offered again if they use the Works tab's "re-review" option. */
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;

  /* ------------------- Sprint 9f: publish pipeline (set on admin approval) ------------------- */

  /** ISO date the work first went live — absent until status reaches "published". */
  publishedAt?: string;
  /** Denormalized from the creator's profile at approval time so cards and the reader never
   * need a second lookup just to render a byline/avatar. */
  authorName?: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  /** Denormalized from the creator's profile at approval time — powers the verified checkmark
   * next to their name on Explore's African Originals cards without a second profile lookup. */
  authorVerified?: boolean;
  /** Equal to this doc's own id — mirrored onto the doc so pages that only hold a
   * publishedSeries summary (which has no `id` field of its own beyond the doc id) still carry
   * an explicit `seriesId` for links back into /manga/[id] and the chapters subcollection. */
  seriesId?: string;
  /** Alias of coverURL kept in step for the publishedSeries summary and Explore cards, which
   * read `coverImage` rather than `coverURL`. */
  coverImage?: string;
  totalReads?: number;
  totalBookmarks?: number;
  averageRating?: number;
  /** Free text historically ("Manga"/"Manhwa"/...); new submissions write one of WorkFormat's
   * lowercase values via the creator dashboard's format selector — display code lowercases
   * before comparing so older, capitalized values still match. */
  format?: string;
  language?: string;
  contentRating?: string;
  updateSchedule?: string;
  chapterCount?: number;

  /** Copyright certificate, generated once on approval — see /creator/certificate/[certId]. */
  certId?: string;
  issuedAt?: string;
  registrationNumber?: string;
}

/** Public-facing summary written to top-level `publishedSeries/{workId}` on approval —
 * denormalized off `CreatorWork` so Explore, /manga/[id], and /creator/[handle]'s Works tab can
 * query and render a creator's published catalog without needing read access to the
 * `creatorWorks` collection's pending/rejected entries (which stay private to the creator and
 * admins). Deliberately the same field shape as the fields Part A adds to `CreatorWork` itself. */
export interface PublishedSeries {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle?: string;
  authorPhotoURL?: string;
  authorVerified?: boolean;
  title: string;
  description: string;
  coverImage: string;
  genres: string[];
  source: "creator";
  /** See WorkFormat — a prose work is browsed/read at /story/[id] instead of /manga/[id]. */
  format: string;
  language: string;
  contentRating: string;
  updateSchedule: string;
  totalReads: number;
  totalBookmarks: number;
  averageRating: number;
  chapterCount: number;
  publishedAt: string;
  certId?: string;
  issuedAt?: string;
  registrationNumber?: string;
  /** Mirrored from CreatorWork.isFeatured — powers Explore's "Featured Creator Works" rail
   * without needing read access to the (creator-private) creatorWorks collection. */
  isFeatured?: boolean;
  /** Sum of every chapter's wordCount, kept in step by addChapter() — prose works only. */
  totalWordCount?: number;
}

/** One chapter of a creator-published work, stored at `series/{workId}/chapters/{chapterId}`.
 * A manga/manhwa/manhua chapter populates `images`; a prose chapter (format: "prose") instead
 * populates `content`/`wordCount`/`estimatedReadTime` and leaves `images` empty — see
 * app/story/[workId]/page.tsx, the reader that renders the latter. */
export interface PublishedChapter {
  id: string;
  chapterNumber: number;
  title: string;
  images: string[];
  coinPrice: number;
  status: "published";
  publishedAt: string;
  /** Prose-only: the chapter's full text. */
  content?: string;
  /** Prose-only: word count of `content`, computed at write time. */
  wordCount?: number;
  /** Prose-only: minutes, estimated from wordCount at ~200 words/minute. */
  estimatedReadTime?: number;
}

/** A chapter saved but not yet published — series/{workId}/draftChapters/{draftId}. Same shape
 * as PublishedChapter minus `status`/`publishedAt` (a draft isn't live yet, so neither applies)
 * plus its own `savedAt`. */
export interface ChapterDraft {
  id: string;
  chapterNumber: number;
  title: string;
  images: string[];
  coinPrice: number;
  savedAt: string;
  content?: string;
  wordCount?: number;
  estimatedReadTime?: number;
}

/** A creator-to-creator series handoff, pending the recipient's decision — see
 * lib/publishedSeries.ts's requestOwnershipTransfer/respondToOwnershipTransfer. */
export interface OwnershipTransferRequest {
  id: string;
  workId: string;
  workTitle: string;
  fromUid: string;
  fromDisplayName: string;
  toUid: string;
  toHandle: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt?: string;
}

export interface HistoryEntry {
  id: string;
  mangaId: string;
  title: string;
  coverURL: string;
  chapterLabel: string;
  readAt: string;
  /** Minutes spent on this chapter, filled in after the fact once the reader navigates away or
   * unmounts (see ReaderClient.tsx) — absent on entries from before this field existed, or if
   * the update-on-leave call didn't get a chance to run (e.g. the tab was closed outright). */
  readingTimeMinutes?: number;
}

export type CoinTransactionType = "purchase" | "spend" | "reward" | "refund";

/** Which real-money product a transaction represents, for revenue reporting — distinct from
 * `type` (which only says purchase/spend/reward/refund in coin terms). Absent on older,
 * purely coin-denominated entries (tips, chapter unlocks, roulette, streak bonuses spent or
 * earned entirely in coins with no direct NGN charge of their own). */
export type TransactionCategory =
  | "coins"
  | "platinum"
  | "tip"
  | "chapter_unlock"
  | "roulette"
  | "streak"
  | "boost"
  | "resolution";

export interface CoinTransaction {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  relatedMangaId?: string;
  relatedChapterId?: string;
  category?: TransactionCategory;
  /** Real-money amount in Naira, set only on transactions backed by an actual Paystack charge
   * (coin-pack purchases, Platinum subscriptions) — the finance dashboard's revenue figures
   * sum this field rather than `amount`, which is coin-denominated. */
  amountNGN?: number;
  /** Paystack's transaction reference, when this entry came from a real charge. */
  paystackRef?: string;
  createdAt: string;
}

/* ---------------------------- Admin: announcements ---------------------------- */

export type AnnouncementTarget = "everyone" | "platinum" | "creators" | "publishers";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target: AnnouncementTarget;
  deliverInApp: boolean;
  deliverHomeBanner: boolean;
  deliverCriticalModal: boolean;
  sentBy: string;
  sentByName: string;
  recipientCount: number;
  createdAt: string;
}

/* ---------------------------- Admin: creator payouts ---------------------------- */

export type PayoutStatus = "pending" | "paid";

export interface EarningsRecord {
  id: string;
  creatorId: string;
  creatorName: string;
  amount: number;
  /** "YYYY-MM" — the earning period this payout row covers. */
  period: string;
  payoutStatus: PayoutStatus;
  paidAt?: string;
  createdAt: string;
}

/* ---------------------------- Admin: error logs & bug reports ---------------------------- */

export type ErrorLogStatus = "open" | "resolved";

export interface ErrorLogEntry {
  id: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  /** Component/page name the error was attributed to, when the caller knows it. */
  component?: string;
  uid?: string;
  status: ErrorLogStatus;
  createdAt: string;
}

export type BugReportStatus = "open" | "in_progress" | "resolved";

export interface BugReport {
  id: string;
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  browserInfo: string;
  reportedBy?: string;
  reportedByName?: string;
  status: BugReportStatus;
  /** Technical team's response, shown back to the reporter on their own profile. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Submitted from the public /contact page's form — never requires a signed-in session, since
 * a locked-out or prospective user is exactly who most needs to reach support. */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

/* ---------------------------- Sprint 10: beta feedback ---------------------------- */

export type BetaFeedbackType = "bug" | "suggestion" | "compliment";

/** Submitted from the floating Beta Feedback button (any page, signed in or not — see
 * components/layout/BetaFeedback.tsx) and triaged from the admin dashboards' Feedback tab. */
export interface BetaFeedbackEntry {
  id: string;
  type: BetaFeedbackType;
  description: string;
  /** The pathname the reporter was on when they opened the feedback modal. */
  page: string;
  uid: string | null;
  email: string | null;
  createdAt: string;
  resolved: boolean;
}

/* ---------------------------- Admin: maintenance mode ---------------------------- */

export type MaintenanceSystem = "reader" | "auth" | "payments" | "notifications" | "all";
export type MaintenanceRequestStatus = "pending" | "approved" | "rejected";

export interface MaintenanceRequest {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
  affectedSystems: MaintenanceSystem[];
  status: MaintenanceRequestStatus;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
}

/** The live maintenance/current document MaintenanceGate subscribes to. */
export interface MaintenanceState {
  isActive: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
  affectedSystems?: MaintenanceSystem[];
}

/* ---------------------------- Notifications ---------------------------- */

export enum NotificationType {
  NEW_CHAPTER = "NEW_CHAPTER",
  COMMENT_REPLY = "COMMENT_REPLY",
  COMMENT_LIKE = "COMMENT_LIKE",
  COINS_RECEIVED = "COINS_RECEIVED",
  PLATINUM_EXPIRING = "PLATINUM_EXPIRING",
  PLATINUM_EXPIRED = "PLATINUM_EXPIRED",
  WORK_APPROVED = "WORK_APPROVED",
  WORK_REJECTED = "WORK_REJECTED",
  NEW_FOLLOWER = "NEW_FOLLOWER",
  ANNOUNCEMENT = "ANNOUNCEMENT",
  ROULETTE_REMINDER = "ROULETTE_REMINDER",
  STREAK_WARNING = "STREAK_WARNING",
  ACHIEVEMENT_UNLOCKED = "ACHIEVEMENT_UNLOCKED",
  EARNINGS_MILESTONE = "EARNINGS_MILESTONE",
  BADGE_APPROVED = "BADGE_APPROVED",
  MODERATION_ACTION = "MODERATION_ACTION",
  GROUP_ADDED = "GROUP_ADDED",
  GROUP_MENTION = "GROUP_MENTION",
  OWNERSHIP_TRANSFER_REQUEST = "OWNERSHIP_TRANSFER_REQUEST",
  OWNERSHIP_TRANSFER_ACCEPTED = "OWNERSHIP_TRANSFER_ACCEPTED",
  APPEAL_APPROVED = "APPEAL_APPROVED",
  APPEAL_DENIED = "APPEAL_DENIED",
  RESTRICTION_LIFTED = "RESTRICTION_LIFTED",
}

/** Named `AppNotification` (not `Notification`) to avoid colliding with the DOM Notification API. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actionURL: string;
  imageURL?: string;
  isRead: boolean;
  createdAt: string;
}

/* ---------------------------- Comments & ratings ---------------------------- */

export interface SeriesComment {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  isVerified?: boolean;
  isPlatinum?: boolean;
  text: string;
  isSpoiler?: boolean;
  /** Null/absent for a top-level comment; otherwise the id of the comment being replied to. */
  parentId?: string | null;
  /** UIDs who liked this comment — count is `likes.length`. */
  likes: string[];
  createdAt: string;
  isEdited?: boolean;
  editedAt?: string;
  /** Set (with `text` replaced by the UI's placeholder) on a soft delete — the doc itself stays
   * so any replies under it keep a parent to render against. */
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface SeriesRating {
  userId: string;
  rating: number;
  review?: string;
  isSpoiler?: boolean;
  createdAt: string;
}

/** Lightweight social-metadata doc keyed by a creator work's own id — the average rating/count
 * rollup submitRating() recomputes each time a new rating comes in. */
export interface SeriesMeta {
  averageRating: number;
  ratingCount: number;
}

/* ---------------------------- Stories ---------------------------- */

export interface Story {
  id: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "text";
  textContent?: string;
  backgroundColor?: string;
  /** Milliseconds this segment stays on screen in the viewer — only meaningful for image/text
   * (video plays for its own natural length instead). Defaults to 5000 for those two. */
  duration?: number;
  expiresAt: string;
  viewedBy: string[];
  createdAt: string;
}

/* ---------------------------- Direct messages ---------------------------- */

export interface Conversation {
  id: string;
  /** Absent on every conversation created before groups shipped — always treat as "direct"
   * when missing, never assume it's set. */
  type?: "direct" | "group";
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string>;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string;
  /** Unread count per participant uid. */
  unreadCounts: Record<string, number>;
  createdAt: string;

  /* ---- Group-only fields (type === "group") ---- */
  name?: string;
  description?: string;
  photoURL?: string;
  /** Uids with admin rights in this group — Make Admin/Remove Member/Delete Group checks read
   * this, not `participants` (every participant, admin or not, is in that array). */
  adminUids?: string[];
  /** The uid who created the group — the only one who can delete it outright (see
   * MessagesClient's Delete Group vs. Leave Group distinction). */
  creatorUid?: string;
}

/** One emoji's worth of reactions on a message — every uid who reacted with that emoji. */
export interface MessageReaction {
  emoji: string;
  uids: string[];
}

/** The message being replied to, denormalized onto the reply so the thread can render a quoted
 * preview without a lookup — kept short and immutable even if the original is later edited. */
export interface MessageReplyTo {
  messageId: string;
  senderName: string;
  preview: string;
}

export interface DMMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  isEdited?: boolean;
  editedAt?: string;
  /** Set (with `content` replaced by the UI) when the sender chose "delete for everyone". */
  isDeleted?: boolean;
  deletedAt?: string;
  /** Uids who chose "delete for me" — hidden from their own view only; the message itself, and
   * everyone else's view of it, is untouched. */
  deletedFor?: string[];
  reactions?: MessageReaction[];
  replyTo?: MessageReplyTo;
}

/* ---------------------------- Creator feed ---------------------------- */

export type CreatorPostType = "update" | "preview" | "announcement" | "milestone";
export type EditingApp = "capcut" | "alightmotion" | "aftereffects" | "premiere" | "other";

export interface CreatorPost {
  id: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  /** Denormalized from the author's profile at post time — powers the "View creator" link
   * without a lookup, since /creator/[handle] is keyed by handle rather than uid. */
  handle?: string;
  /** Plain text, capped at 500 chars at write-time by createPost. */
  content: string;
  type: CreatorPostType;
  /** Up to 4 image URLs (Firebase Storage download URLs). */
  attachments: string[];
  /** UIDs who liked this post — count is `likes.length`. */
  likes: string[];
  commentCount: number;
  /** Incremented once per viewer session the first time a post scrolls into view — powers the
   * creator dashboard's per-post analytics. */
  views?: number;
  /** Badges denormalized onto the post at write-time so the feed can render them without a
   * per-post profile lookup — mirrors the author's profile at the moment they posted. */
  isVerified?: boolean;
  isPlatinum?: boolean;
  isFoundingCreator?: boolean;
  /** Sound attached via the composer's "Add Sound" flow — all fields denormalized from the
   * chosen Sound at post time so the feed card never needs a per-post sound lookup just to
   * play/display it. Absent entirely on posts with no sound. */
  soundId?: string;
  soundUrl?: string;
  soundTitle?: string;
  soundArtist?: string;
  soundSource?: SoundSource;
  soundDuration?: number;
  /** Also denormalized at post time (beyond the fields the composer directly needs) so the
   * feed's category filter chip ("African Beats") can filter client-side without a per-post
   * sound lookup. Absent for Spotify-sourced sounds, which don't carry one of our categories. */
  soundCategory?: SoundCategory;
  createdAt: string;

  /* ------------------------- Sprint 9b: video/drafts/boost/For You ------------------------- */

  /** What kind of media this post carries. "images" covers the pre-existing multi-attachment
   * case; "image" is reserved for a single-image post that also carries an `imageResolution`.
   * Older posts predating this field are treated as "none" or "images" (via attachments.length)
   * by readers rather than requiring a migration. */
  mediaType?: "none" | "image" | "images" | "video";
  /** Firebase Storage download URL for the uploaded video. */
  videoUrl?: string;
  /** Poster/thumbnail frame shown before playback starts. */
  videoPosterUrl?: string;
  /** Seconds. */
  videoDuration?: number;
  videoResolution?: "480p" | "720p" | "1080p" | "2k" | "4k";
  imageResolution?: "standard" | "hd" | "2k" | "4k";
  /** True while the post is a private draft (not yet published to the feed) — draft documents
   * live under `users/{uid}/drafts/` rather than the top-level `creatorFeed` collection, so a
   * `CreatorPost` with `isDraft: true` is only ever seen by its own author via getDrafts(). */
  isDraft: boolean;
  /** ISO date string, same convention as `createdAt` — set each time saveDraft() writes. */
  draftSavedAt?: string;
  /** Self-reported app the creator used to edit their video, shown as a small badge on the card.
   * `null` (as opposed to omitted) records that the creator was explicitly asked and chose not
   * to disclose one, vs. `undefined` for posts predating this field entirely. */
  editingApp?: EditingApp | null;
  /** 0 = not boosted. 1/2/3 = boost tier purchased with coins — see BOOST_TIERS in creatorFeed.ts. */
  boostLevel: 0 | 1 | 2 | 3;
  /** ISO date string, same convention as `createdAt`. */
  boostExpiresAt?: string;
  /** Computed ranking score powering the For You feed — see calculateForYouScore(). */
  forYouScore: number;
  /** Distinct-viewer count, incremented via incrementViewCount() (a superset of the older
   * `views` field, which only counted the pre-video-era "scrolled into view" event). */
  viewCount: number;
  /** Cumulative seconds watched across all viewers, incremented via trackWatchTime(). */
  watchTime: number;
  /** Whether this post's author's role permits it to appear in the algorithmic For You feed at
   * all (independent of its score) — set at createPost() time from the author's role. */
  forYouEligible: boolean;

  /* ------------------------- TikTok Feed Overhaul: extra ranking signals ------------------------- */

  /** Distinct view-sessions that played past 80% of the video, via trackVideoCompleted(). */
  completedViews?: number;
  /** Times a video looped back to the start while still in view, via trackVideoReplay(). */
  replayCount?: number;
  /** Times a viewer tapped through to the author's profile from this post, via trackProfileVisit(). */
  profileVisits?: number;
  /** Times this post was shared (any share sheet option), via trackShare(). */
  shareCount?: number;
}

/* ---------------------------- Feed post comments ---------------------------- */

/** `creatorFeed/{postId}/comments/{commentId}` — threaded comments on a feed post, same
 * top-level-plus-one-reply-level shape as SeriesComment (see components/social/CommentSection.tsx
 * for the pattern this mirrors), rendered by the TikTok-style comment sheet. */
export interface FeedComment {
  id: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  isVerified?: boolean;
  text: string;
  /** Null/absent for a top-level comment; otherwise the id of the comment being replied to. */
  parentId?: string | null;
  /** UIDs who liked this comment — count is `likes.length`. */
  likes: string[];
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

/* ---------------------------- Sprint 9e: blocking ---------------------------- */

/** `users/{uid}/blocked/{targetUid}` — one doc per blocked account. */
export interface BlockedUser {
  targetUid: string;
  blockedAt: string;
}

/* ---------------------------- Sprint 9e: reading activity ---------------------------- */

/** `users/{uid}/readingActivity` — one live document per user (fixed doc id, same
 * one-record-per-user pattern as Sprint 9d's `nowPlaying`/`spotifyAuth`), overwritten on every
 * chapter load rather than appended to, so a single onSnapshot always reflects the latest page. */
export interface ReadingActivity {
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterTitle: string;
  coverImage: string;
  isReading: boolean;
  startedAt: string;
  lastUpdatedAt: string;
}

/* ---------------------------- Sprint 9d: Spotify integration ---------------------------- */

/** `users/{uid}/spotifyAuth` — the real Authorization Code OAuth grant, server-refreshed via
 * lib/spotify.ts's getSpotifyAuth(). Never read directly by any UI component; always go through
 * getSpotifyAuth()/getCurrentlyPlaying() etc. so the expiry-check-and-refresh logic runs. */
export interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  connectedAt: string;
  spotifyUserId: string;
  /** Spotify's own display name for the account, fetched once at connect time — what the
   * Settings tab actually shows as "connected as ...", since `spotifyUserId` is often an opaque
   * id rather than a human-readable handle. */
  spotifyDisplayName?: string;
}

/** `users/{uid}/nowPlaying` — one document per user, overwritten on every sync tick by
 * updateNowPlaying() rather than appended to, so a single onSnapshot listener is always reading
 * the latest state. The two states (currently playing vs. last played) are mutually exclusive:
 * `isPlaying: true` rows carry `trackName`/`artistName`/etc.; `isPlaying: false` rows carry the
 * `last*`-prefixed fields instead. */
export interface NowPlaying {
  isPlaying: boolean;
  trackName?: string;
  artistName?: string;
  albumArt?: string;
  trackUrl?: string;
  previewUrl?: string | null;
  progressMs?: number;
  durationMs?: number;
  lastTrackName?: string;
  lastArtistName?: string;
  lastAlbumArt?: string;
  lastTrackUrl?: string;
  lastPlayedAt?: string;
  updatedAt?: string;
}

/** `listenSessions/{hostUid}` — a lightweight, ephemeral "Listen Along" room keyed by whoever is
 * hosting; listeners join/leave via arrayUnion/arrayRemove on `listeners` rather than each
 * getting their own subdocument, since the only thing anyone needs is the current roster. */
export interface ListenSession {
  hostUid: string;
  listeners: string[];
  previewUrl: string;
  trackName: string;
  startedAt: string;
}

/* ---------------------------- Sounds ---------------------------- */

export type SoundCategory = "African Beats" | "Intense" | "Romantic" | "Chill" | "Epic";
export type SoundSource = "library" | "creator" | "spotify";

export interface Sound {
  id: string;
  title: string;
  artist: string;
  /** Seconds. */
  duration: number;
  url: string;
  /** Cloudinary public_id for this file, needed to delete it (see deleteCreatorSound in
   * lib/sounds.ts) — absent on library sounds (never deletable this way) and on any
   * creator-uploaded sound saved before this field was tracked. */
  publicId?: string;
  category: SoundCategory;
  source: SoundSource;
  usageCount: number;
  /** Set only on source:"creator" sounds — the uid of whoever uploaded it. */
  uploadedBy?: string;
  createdAt: string;
}

/* ---------------------------- Offline reading ---------------------------- */

export interface DownloadedChapterMeta {
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  coverURL: string;
  chapterLabel: string;
  pageCount: number;
  /** Approximate total size in bytes of every stored page blob. */
  sizeBytes: number;
  downloadedAt: string;
}

/* ---------------------------- Reports ---------------------------- */

export type ReportTargetType = "comment" | "chapter" | "series" | "user" | "dm" | "post";
export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate"
  | "copyright"
  | "underage"
  | "other";
export type ReportStatus = "pending" | "resolved" | "actioned";
export type ModerationAction = "warn" | "suspend7" | "ban" | "delete_content";

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTargetType;
  targetId: string;
  /** The uid of the person being reported, when known — lets moderation actions target them. */
  targetUserId?: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  actionTaken?: ModerationAction;
  createdAt: string;
  /** Whether the REPORTER (not the person being reported) is Platinum — Sprint 9e's Platinum
   * perk tags their reports "💎 Priority" in the admin review queue. Backend-only signal; never
   * shown to the reporter themselves. */
  reporterIsPlatinum?: boolean;
}

/* ---------------------------- Ban appeals ---------------------------- */

export type AppealStatus = "pending" | "approved" | "denied";

/** `appeals/{uid}` — a banned account's appeal, submitted from /banned. One per uid; a fresh
 * submission overwrites the previous one rather than piling up documents. */
export interface Appeal {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  /** What the appellant wrote, explaining why they should be reinstated. */
  reason: string;
  /** The original moderation reason their account was banned for, snapshotted at submission
   * time so the admin table doesn't need a second profile lookup. */
  banReason?: string;
  status: AppealStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}
