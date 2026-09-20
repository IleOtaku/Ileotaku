# Sprint 9e — Bugs Found & Fixed

Sprint 9e added history management, user blocking, reading-activity sharing, five new
Platinum benefits, and closed out two follow-up items (13b: ad invisibility for Platinum,
13c: "Go Platinum" upsell removal for Platinum). This log records every bug found during that
work — both caught through code review before anything was tested, and caught live in the
browser — with what it was, how it was found, and how it was fixed.

## Found via live browser testing

### 1. Firestore index misconfiguration broke History reads for every signed-in user
**Found:** Loading `/profile` (History tab data, and the new Reading Stats card) threw
`FirebaseError: The query requires a COLLECTION_DESC index for collection history and field
readAt` in the browser console, and the new Reading Stats card was stuck in its loading skeleton
forever with a "1 error" toast.

**Cause:** `firestore.indexes.json` has a field override for `history`/`readAt` that declared
only `COLLECTION_GROUP`-scope indexes (added, correctly, for an admin collection-group query in
`lib/admin.ts`). A Firestore field override *replaces* the default automatic indexing for that
field rather than adding to it — so declaring only `COLLECTION_GROUP` silently deleted the
plain-`COLLECTION`-scope index that `getHistory()`, `clearHistoryOlderThan()`, and the new
`getReadingStats()` all depend on (a query against `users/{uid}/history` ordered by `readAt` is a
`COLLECTION`-scope query, not a collection-group one). This is a pre-existing bug — I didn't
introduce the override — but it broke a brand-new Sprint 9e feature (Reading Stats) and made it
worth fixing now rather than filing away.

**Fix:** Added `{ "order": "ASCENDING"/"DESCENDING", "queryScope": "COLLECTION" }` entries
alongside the existing `COLLECTION_GROUP` ones in the `history`/`readAt` override, and deployed
via `firebase deploy --only firestore:indexes`. Confirmed live: the error changed from "you can
create it here" to "not ready yet, building", and once the index finished building, `/profile`
loaded a fully populated Reading Stats card with no errors.

### 2. Blocking a user could silently fail entirely if their profile doc had any write issue
**Found:** Clicking Block on a DM contact ("Test Viewer", a conversation with no backing
`users/{uid}` profile document) showed "Couldn't block this user. Please try again." — the block
never took effect.

**Cause:** `blockUser()` wrote the actual block record (`users/{uid}/blocked/{targetUid}`) and
then ran the followers/following cleanup as two `updateDoc` calls inside a single `Promise.all`.
`Promise.all` fails fast — if either cleanup write threw (here, because the target had no
`users/{targetUid}` document for `updateDoc` to update), the whole `blockUser()` call rejected,
including the block record that had *already been written successfully*. The block record itself
is the only privacy/safety-critical write here; the followers/following cleanup is a nice-to-have
side effect that should never be able to fail the whole operation.

**Fix:** Split `blockUser()` into two phases: the block-record `setDoc` stays in its own
try/catch and is the only thing that can make the function throw; the two cleanup `updateDoc`
calls are now independently wrapped in their own `.catch()` (best-effort, logged, never
re-thrown). Confirmed live: blocking the same contact now succeeds ("Blocked @Test Viewer."), the
Block icon disappears from the DM header, and the thread shows "You've blocked this user." in
place of the composer.

### 3. Settings' Blocked Users list silently dropped blocks against accounts with no resolvable profile
**Found:** Immediately after successfully blocking a user (bug #2, above, now fixed), Settings →
Blocked Users still showed "You haven't blocked anyone." — even though the block was active and
correctly enforced everywhere else (DM banner, block icon state).

**Cause:** The list loader fetched every blocked uid, resolved each to a full profile via
`getUserProfile()`, and then did `.filter(p => p !== null)` — silently dropping any uid whose
profile lookup came back null. That's not just a test-fixture quirk: the same thing happens for
any real block against an account that's since been deleted via the existing `deleteMyAccount()`
flow, permanently orphaning that block from the management UI with no way to review or undo it.

**Fix:** Changed the list to keep every blocked uid regardless of profile-resolution success, and
render a "Deleted user" fallback row (generic avatar, no handle, still-working Unblock button) for
any uid whose profile is null. Confirmed live: the blocked contact now shows correctly, and
Unblock removes it and restores the empty state.

## Found via code review, before any live testing

### 4. `blocked` subcollection's owner-only read rule would have made `isBlockedBy()` impossible
An owner-only `allow read: if isOwner(uid)` rule on `users/{uid}/blocked` makes checking "has
this OTHER account blocked me" structurally impossible — that check inherently requires reading a
document under someone else's uid while signed in as yourself. Caught via reasoning before ever
deploying rules or testing; fixed to `allow read: if isSignedIn()` (any signed-in user), write
still owner-only. Documented in `firestore.rules` as an accepted narrow trade-off: anyone who
already knows both uids can confirm a specific block exists, in exchange for profile-visit/DM/
comment gating actually working.

### 5. Stale-closure bug in the reading-reminder "Clear" button
`onClick={() => { setReminderDraft(""); handleSaveReminder(); }}` read `reminderDraft` from a
closure that still held the OLD value, since `setReminderDraft("")` only schedules a re-render —
so "Clear" would have re-saved the previous reminder time instead of clearing it. Fixed by
refactoring to `saveReminderTime(value: string)`, which takes the value as an explicit parameter
instead of reading it from state.

### 6. Unescaped quotes in new JSX text
Two new paragraphs in `SettingsTab.tsx` used literal straight quotes (`"Followers only"`,
`"Reading now 📖"`) instead of this codebase's established `&quot;` convention for quoted text in
JSX, which would likely have failed the `react/no-unescaped-entities` lint rule at build time.
Fixed before ever building.

### 7. Awkward `blockUser` write pattern / inefficient `getFollowingActivity` read
Two self-caught code-quality issues, fixed before first run: `blockUser`'s Firestore write was
initially an `updateDoc().catch(dynamic-import-then-setDoc)` fallback, simplified to a direct
`setDoc`. `getFollowingActivity`'s per-follow activity lookup initially fetched and searched a
whole (single-doc) subcollection instead of calling `getDoc` on the known document id directly.

## Part 13c — "Go Platinum" upsell for Platinum users (real bug, not just verification)

The sprint's own request described this as "already conditionally hidden — verify it's working."
It wasn't: both the desktop and mobile "Go Platinum" buttons in `components/layout/Navbar.tsx`

# Sprint 9f — Full Platform Integrity Audit

A full-platform pass across profile layout, profile-picture consistency, the creator-works
publishing pipeline, missing pages, and a codebase-wide dangling-link sweep. Sprint 9e's earlier
finding pattern repeated here too: several reported "bugs" (Part 1's banner layering, most of
Part 2's photoURL locations) turned out to already be correctly implemented on inspection — noted
below as "verified, no bug found" rather than padded into fixes that didn't happen. The real
finds and the actual feature build are below.

## Part 1 — Public profile layout

**Verified, no bug found:** `/profile` (`ProfileClient.tsx`), `/creator/[handle]`, and
`/profile/[uid]` all already used the correct sibling-div-with-negative-margin banner pattern
(banner and content as DOM siblings, content pulled up with `-mt-*`, no absolute-positioning/
z-index trap). None exhibited the "banner on top of content" bug the sprint description
predicted. Applied the sprint's exact requested structure (`relative` outer wrapper, explicit
`z-10` on the content div) to all three anyway, as a harmless hardening/consistency pass.

**Real gap fixed:** `/profile/[uid]/page.tsx` had no cover banner at all and was missing
`coverStyle`, `chaptersRead`, and a "Titles Tracked" stat that the creator/own-profile pages
already showed. Added a `coverStyle`-driven banner (reusing `getCoverGradient` from
`CoverStylePicker.tsx`) and the missing stats to the page's stat grid.

## Part 2 — Profile picture everywhere

Audited all 14 locations from the sprint's checklist via `grep`. 11 already correctly implemented
`photoURL ? <img> : <initials-div>` with `stringToColor` fallback, including
`components/messages/MessagesClient.tsx` (DM list + thread header) — initially suspected broken
from a shallow grep match, but a full read showed it already reads `c.participantPhotos?.[other]`
correctly. Two real, confirmed gaps:

- **`components/admin/UsersTable.tsx`** — the admin users table unconditionally rendered
  initials for every row, never checking `u.photoURL`. Fixed to the standard pattern.
- **`components/layout/NotificationBell.tsx`** — every notification showed only its type emoji
  (📖💬❤️ etc.), never the triggering user's avatar, even though `AppNotification.imageURL` already
  existed on the type and `createNotification()` already accepted an `imageURL` param — no call
  site ever passed one. Wired `lib/social.ts`'s `followUser()` to pass the follower's
  `photoURL` as `imageURL`, and updated `NotificationBell.tsx` to render it (falling back to the
  type emoji when absent, since most notification types have no single "actor" photo).

## Part 3 — Creator works pipeline (built from scratch; none of this existed before)

The pipeline described in the sprint spec did not exist at all: `approveWork()` only set
`status: "approved"` (never `"published"`) and no code anywhere wrote to a `publishedSeries`
collection or a `series/{id}/chapters` subcollection. This meant Explore's "African Originals"
was a permanent "Coming Soon" placeholder, `/manga/[id]` had no path to a creator-work id at all
(a non-`mdx-`/`cmk-`/`mhk-`-prefixed id silently rendered the wrong fallback demo series instead
of a 404 or the real work), and `/creator/[handle]`'s Works tab always showed "Nothing published
yet" — a real, user-facing bug distinct from just an unfinished feature.

Built: `types/index.ts`'s `PublishedSeries`/`PublishedChapter` types and `CreatorWork`'s new
publish-time fields; `lib/publishedSeries.ts` (all reads/writes for the new collections, plus the
`MangaDetailData`-shaped projection that lets `/manga/[id]` and the reader treat a creator work
exactly like an imported one); `lib/admin.ts`'s `approveWork()` rewritten to publish + write the
`publishedSeries` summary + generate the copyright certificate in one pass; `lib/manga-api.ts`'s
`getMangaDetail`/`getChapterPages` dispatch extended to recognize creator-work ids and
`creator:{workId}:{chapterId}` composite chapter ids; Explore's African Originals section now
queries real data; `/manga/[id]` shows the "African Original 🌍" badge and links its Creator card
to `/creator/[handle]`; `/creator/[handle]`'s Works tab now queries `publishedSeries` directly
(closing a minor pre-existing data-exposure gap too — the old `creatorWorks`-backed version
serialized every pending/rejected work, including its private `rejectionReason`, into the public
profile page's client bundle); the reader's `ImportedContentGate`/`getLockConfig` extended so a
creator chapter's own author-set coin price actually gates it (previously documented as
intentionally unlocked for every creator chapter — Part 3F's "set coin price" requirement
supersedes that); the creator dashboard's Add Chapter flow (multi-image drag-reorder upload,
chapter number/title/coin price, `NEW_CHAPTER` follower notifications); and the printable
`/creator/certificate/[certId]` page plus a certificate/Add-Chapter section on each published
`WorkCard`. New Firestore rules added for `publishedSeries` and `series/{id}/chapters`.

## Part 4 — Additional broken surface found during the link/button sweep

**Real bug:** The logged-in Home Feed (`components/home/HomeClient.tsx`, shared by both the
logged-out landing page and the signed-in feed) had its OWN separate hardcoded "African
Originals — Coming Soon" rail, entirely independent of Explore's — meaning fixing Explore alone
(Part 3B) would have left this second, more prominent placement (the actual home feed logged-in
users see first) still permanently showing fake placeholder titles with no real data or links,
even after real creator works existed. Fixed the same way as Explore: `app/page.tsx` now fetches
`getAfricanOriginals(3)` server-side and passes it to `HomeClient`, which renders real cards
(cover, title, 🌍 badge, linking to `/manga/[id]`) once any exist, falling back to the original
static placeholder rail only while the catalog is genuinely empty.

## Part 7 — Missing pages

`/help`, `/contact` (with a real Firestore-backed form via a new `contactMessages` collection),
and `/creator/certificate/[certId]` were built per spec. A full codebase sweep for every
`href`/`router.push` referencing an internal route with no corresponding `app/**/page.tsx` found
three more dangling links beyond what the sprint description named: `/about`, `/terms`, and
`/privacy` were all linked (Footer, `SignupForm.tsx`) but had no page at all — built all three.
Also found and fixed `components/landing/Hero.tsx`'s logged-out "Explore the Catalog" button,
which linked to `/browse` — a route that has never existed in this app — repointed to `/reader`
to match the same "Browse"-labeled link everywhere else in the codebase (Navbar, Footer).

## Found via live browser testing (Part 3's pipeline)

Unlike most of this sprint, Part 3 was live end-to-end tested, not just code-reviewed: a real
work was submitted, approved through the live admin panel, and its chapter uploaded through the
live Add Chapter flow, signed in as two real accounts against the live dev Firebase project. That
testing surfaced two real bugs neither code review nor `tsc`/`build` could have caught:

### 1. Explore's African Originals rail silently stayed empty after a real approval
**Found:** Approving a work (confirmed via a direct Firestore read that the `publishedSeries` doc
was written correctly, with every field) still left Explore showing "Coming Soon" — and the
certificate page and `/creator/[handle]` Works tab were unaffected, only the Explore rail.

**Cause:** Same class of bug as Sprint 9e's bug #1: `getAfricanOriginals()`'s
`where("source","==","creator").orderBy("publishedAt","desc")` query needs a Firestore composite
index that didn't exist. The query throws `FAILED_PRECONDITION`, which the function's catch block
silently swallows into an empty array (correct behavior for an actually-empty catalog, wrong
diagnosis for a missing index) — a `next dev` build gives no compile-time warning for this at all.

**Fix:** Added the `publishedSeries` composite index (`source` ASC, `publishedAt` DESC) to
`firestore.indexes.json` and deployed it (`firebase deploy --only firestore:indexes`, approved by
the user first since it changes the live project). Confirmed live: once the index finished
building, the rail correctly showed all three test works, newest first.

### 2. A work could reach "published" with a certificate but no public listing at all
**Found:** During testing, one approved work ended up "Published" with a working certificate
*link* on its own dashboard card, but that link 404'd, and the work never appeared on Explore or
its creator's profile — while a second, identically-approved work worked perfectly.

**Cause:** `approveWork()` did two independent Firestore writes in sequence — `updateDoc` on the
`creatorWorks` doc (which succeeds first and is what the dashboard card and certId link read from)
then a separate `setDoc` on the new `publishedSeries` doc. Nothing made them atomic, so anything
that can interrupt a page mid-request (a closed tab, a dropped connection, a fast client-side
navigation right after the action) can let the first write land and the second one vanish,
leaving a work that looks published everywhere except the one collection Explore, `/manga/[id]`,
and the creator profile actually read from.

**Fix:** Rewrote `approveWork()` to use a single Firestore `writeBatch` covering both documents,
so they always commit together or not at all. Also repaired the one work left in the broken state
from testing by backfilling its missing `publishedSeries` doc. Confirmed live: re-tested the same
approve flow twice more (including one run with an intentionally short wait to try to reproduce
the interruption) and both writes landed together every time.

## Build status

`npx tsc --noEmit`: 0 errors. `npm run build`: every route compiles clean, including the six new
ones this sprint added (`/about`, `/contact`, `/help`, `/privacy`, `/terms`,
`/creator/certificate/[certId]`).
were rendered **unconditionally**, with no `isPlatinum` check at all. Fixed both. Confirmed live,
signed in as a Platinum account: no "Go Platinum" button anywhere in the navbar, desktop or
mobile.

## Part 13b — ad invisibility for Platinum (audited, no bug found)

Confirmed structurally (and via a codebase-wide grep for ad-related UI) that no fix was needed:
`ImportedContentGate`'s Platinum branch transitions straight to `state.status === "open"` and
renders `{children}` directly — `AdGate`/`CoinGate` are never instantiated for a Platinum viewer,
so there's nothing to hide. No other ad-slot or "watch ad" UI exists anywhere else in the
codebase.

## Audit scope note

This was a real-but-scoped audit rather than a literal click-through of the full 80+-item
checklist in the sprint request: a code-level read-through of the newest/riskiest surfaces (all
of Sprint 9e's new features, plus the areas 13b/13c named) combined with live browser testing of
the highest-value flows — reader theme picker + persistence, the full DM/Settings block+unblock
round-trip, Reading Stats, and the Navbar/admin verification above. `npx tsc --noEmit` and
`npm run build` were run clean (zero errors, all 18 routes, no chunk over 500KB) after every fix
in this log. Areas outside Sprint 9e's own new surfaces (payments, admin moderation actions
beyond Reports, mobile PWA install flow, etc.) were not re-audited this sprint.

# Beta Feedback Triage — Sprint

Source: `/admin` → Feedback tab (16 items), Bug Reports (2 items), Error Logs (478 raw entries,
read directly via the Firebase Admin SDK rather than the browser — see the session notes for why).

## 🔴 Critical bugs — fixed

1. **Can't like posts/videos in the feed.** (Bug reports x2 + 44 matching `creatorFeed.likePost`
   permission-denied entries in the error log.) `likePost()` writes `likes` and `forYouScore`
   together in one `updateDoc`, but the Firestore rule's like-toggle carve-out only allowed
   `likes` alone — every like from someone other than the post's own author was silently
   rejected. Fixed in `firestore.rules` (added `forYouScore` to that carve-out).
2. **A creator's own posts don't show on their profile's Posts tab.** ("This user has posted a
   lot on feed, but it's showing he hasn't posted anything on his profile." + 56 matching
   `creatorFeed.getPostsByCreator` permission-denied entries.) `/creator/[handle]` is a Next.js
   Server Component with no client Auth session, but `creatorFeed`'s read rule required
   `isSignedIn()` — every server-rendered load of that page failed the permission check outright.
   Fixed in `firestore.rules` (creatorFeed read is now public, same reasoning `publishedSeries`
   already uses). This same fix also stopped `getForYouFeed` failing for signed-out visitors to
   `/feed` (9 more matching error-log entries).
3. **Video story uploads always failed.** (5 `createStory` "Unsupported field value: undefined"
   entries, today's date.) `lib/stories.ts` wrote `duration: undefined` literally into `addDoc()`
   for a video segment — Firestore rejects that outright. Fixed: the field is now omitted
   entirely for video (it was only ever meaningful for image/text segments).
4. **"I can't view people's profiles... except message."** (Bug report, mobile.)
   `BlockedContentGate` rendered nothing at all (`return null`) for the entire time its block
   check was in flight — on a slow/flaky connection (confirmed via 13 matching `blocking.isBlocked`
   "client is offline" error-log entries) that meant a completely blank profile page. Fixed:
   content now renders immediately; the block notice only swaps in once a block is actually
   confirmed.
5. **Account deletion silently left a dangling login credential.** (2 `auth/requires-recent-login`
   error-log entries.) `deleteMyAccount()` always reported success even when Firebase's
   `deleteUser()` failed — the account's data was gone, but its email/password credential stayed
   registered, so that email could never sign up again. Fixed: the delete-account modal now asks
   for the current password first (for accounts that have one) and reauthenticates *before*
   deleting anything, so the credential is actually removed in the normal case; the one remaining
   fallback path (social-only accounts with a stale session) now reports honestly instead of
   claiming full success.

## 🟡 UI/UX issues — fixed

6. **"On the navbar of all pages, for desktop. Browse is too close to the logo."** The navbar's
   `justify-between` layout only distributed *leftover* space between the logo and the nav links,
   which shrank to almost nothing on medium-width desktops. Fixed with a firm minimum gap
   (`md:ml-10`) that no longer depends on how much space happens to be left over.
7. **Feed post timestamps never became an actual date.** ("Posts should show dates when the post
   has exceeded... 7 days ago, then start showing 14-08-2026.") Added `formatPostTimestamp()` —
   relative ("6 hours ago") under 7 days, a plain `dd-MM-yyyy` date after that — and used it on
   both feed surfaces (`FeedPostCard`, `TikTokFeedItem`).
8. **Error Logs tab was 44% noise.** 212 of 478 entries were "Failed to get document because the
   client is offline" — a benign, expected condition (mobile users losing signal for a moment),
   not a bug, and it was burying every real signal in the list. `logError()` now drops this one
   specific message rather than persisting it.

## 🟢 Feature requests — implemented

9. **Verification badges and Platinum star in comments, "everywhere."** Feed comments
   (`FeedCommentSheet`) had neither badge rendered even though `isVerified` was already being
   saved on each comment; series/chapter comments already had both. Added `isPlatinum` to
   `FeedComment`, denormalized it the same way `isVerified` already was, and rendered both badges.
   Also added them to the DM thread header (`MessagesClient`), which had neither.
10. **Admin: unverify a user, not just verify them.** `verifyCreator`/`verifyPublisher` existed
    with no way to undo a verification. Added `unverifyUser()` + an "Unverify" row action.
11. **"Allow us to delete people we no longer chat [with]."** Added `hideConversationForUser()` —
    removes a conversation from *your own* sidebar only (never the other participant's, never any
    messages); it reappears automatically the next time anyone sends a new message into it. A
    delete icon now sits on every conversation row.
12. **"Creators should receive notifications as soon as a user likes... their posts."** `likePost()`
    now sends the post's author a notification on a fresh like (never for liking your own post).
    Added a matching `POST_LIKE` notification type, wired to the `postLike` Settings toggle that
    already existed with nothing triggering it.
13. **"They [creators] should be able to delete comments for all. Users that posted comments too
    should be able to delete them."** The second half already worked (`user.uid === comment.uid`
    could already delete their own). Added the first half: a post's own author can now also
    soft-delete anyone's comment on their post, in both the UI (`FeedCommentSheet`'s menu) and the
    Firestore rule (a narrow carve-out scoped to the three soft-delete fields only).
14. **"Links should be clickable... and formatted to be shorter."** `MentionText` (used by every
    DM, comment, and chat surface in the app) now turns a plain `http(s)://` URL into a real link,
    opened in a new tab, with a shortened label (`example.com/some-path…` instead of the full raw
    URL) once it's long enough to matter.

## ⚪ Suggestions — noted, not built this pass

- **"Group admin should be able to delete other people's messages for everyone."** Needs a
  group-admin-aware delete path (today only a message's own sender can delete it) plus a matching
  Firestore rule change scoped to group admins specifically — a real feature, deliberately not
  rushed into the same pass as the fixes above.
- **Video seek bar, tap-to-pause/play, and a creator-side "prevent downloads" toggle.** All
  reasonable; the download-prevention toggle in particular needs a product decision (what it
  actually blocks — right-click save, screen recording can't be stopped client-side either way)
  before it's worth building.
- **"Admin should be able to mark users as verified... and unverify them. Verification should also
  automatically remove after 6 months of inactivity."** The manual verify/unverify half is done
  (#10 above). The automatic 6-month-inactivity expiry needs a scheduled job — this project has no
  Cloud Functions/cron deployment today, so it would need one stood up specifically for this,
  which is a bigger lift than a beta-fixes pass.
- **Share-to-group when sharing a post, and a download button on a shared post (creator-toggled).**
  Both reasonable, both need real design/scope decisions (a share-to-group flow that doesn't just
  paste a link; what "downloadable" actually produces) rather than a quick implementation.
- **DM link previews (unfurled title/image), on top of the clickable+shortened links now shipped.**
  Needs a URL-metadata-fetching endpoint (there's no generic link-unfurling service wired into this
  app) — the clickable/shortened half of this ask is done (#14), the rich-preview half is not.
- **"Allow free users to buy 1hr ads-free with coins."** A real monetization feature, but one that
  needs a price and an exact scope decision (what "ads-free" actually suppresses, whether it stacks
  with existing Platinum ad-suppression) that isn't mine to make unilaterally.
- **"@zamyilton should be the only one with a golden verified symbol. He created this."** An
  opinion about one specific account rather than a general product rule — nothing to generalize
  into code from this one.

## Also found (not from feedback) and fixed while investigating

- Several other error-log clusters (a missing composite index that turned out to already be
  deployed, a handful of `ReferenceError`s like `avatarURL`/`SOUND_FILTERS is not defined`,
  `getCoverGradient is not a function`) were investigated and found to be **stale** — either
  already fixed by code already in the current source, or artifacts of local `next dev` testing
  (one entry's URL was literally `localhost:3002`) rather than the deployed production site. Left
  as-is rather than "fixing" code that's already correct.
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured` (2 entries): this is a **Vercel environment
  variable that isn't set**, not a code bug — the code already fails gracefully (logs and moves on,
  doesn't crash anything). Push notifications won't actually deliver in production until that key
  (from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates) is added to
  the Vercel project's environment variables — that's an infrastructure step outside what a code
  change can fix.

## Found during live regression testing after deploy

Signed in as the real admin account (the user logged in themselves — I don't type credentials)
and walked through reading a manga chapter, the feed, DMs, profile/settings, notifications,
search, and the admin panel on the live, just-deployed site. Confirmed working exactly as fixed:
liking a post (toggled both ways, no permission error), Zamyilton's Posts tab now showing real
posts, the navbar gap, verification+Platinum badges on a freshly-posted comment and in a DM
thread header, a clickable/shortened link sent in a DM, the granular notification-preferences UI,
live search, and the notification bell.

**One anomaly found, not yet root-caused:** clicking "Unverify" on a verified user
(`components/admin/UsersTable.tsx` → `unverifyUser()` in `lib/admin.ts`) shows the success toast
and closes the menu, but a direct Firestore read immediately after shows `isVerified`/
`verifiedType` unchanged — the write does not appear to actually persist. Checked and ruled out:
the calling account's `isAdmin` flag (true), the `firestore.rules` update rule for `users/{uid}`
(admin should bypass every other condition), and the component's own click-handler wiring (reads
correctly on inspection) — none show an obvious defect, and no error surfaced in the browser
console during the attempt. This needs a focused follow-up session with real-time Firestore
logging or the Firebase emulator to actually observe the write attempt rather than just its
before/after state. No harm done in the meantime: the target account's real data was verified
unchanged throughout testing, and "Verify Creator"/"Verify Publisher" (the admin action's
opposite direction, unaffected by whatever this is) were not tested and are assumed fine pending
that same follow-up.

**Not completed this pass:** the 375px mobile-viewport check, and the tail end of DM/feed
regression testing, were cut short by a session-wide tool-use rate limit encountered mid-test —
not a bug in the app. Everything fixed earlier in this pass (Parts 1-14 above) was already
confirmed individually before the limit hit; it's only the very last couple of checklist items
that didn't get a dedicated look.

## Build status

`npx tsc --noEmit`: 0 errors. `npm run build`: clean.

# Second Beta Feedback Pass — Remaining 18 Items

A follow-up triage of everything still `resolved: false` in `betaFeedback` after the sprint
above, worked through as four sequential commits (bugs, then UI/UX, then quick suggestions, then
bigger suggestions).

## Commit 1 — remaining bugs

- **"Page reloads after each comment sent."** Genuinely reproduced this time (the two earlier
  investigation passes, in the sprint above and in a prior session, both failed to find it via
  static code review alone). Root cause: `FeedClient.tsx`'s `loadFirstPage` and its live
  `subscribeToFeed` effect were both keyed on the whole `profile` object, so the "Following" tab
  could refetch when the user's follow list changed. But `addFeedComment` (and `sendDM`, chapter
  reads, etc.) call `updateLastActive(uid)` on every action, which writes `lastActiveAt` to the
  *commenter's own* user doc — giving `profile` a new object reference and silently wiping and
  refetching the entire feed from scratch after every single comment (confirmed live via a
  `MutationObserver`: the whole post, including its `<video>`, was torn down and remounted the
  instant the comment write completed). Fixed by keying those two effects on a value-compared
  `followingKey` string instead of the `profile` object itself.
- **"The emoji button doesn't work"** (DM composer). The `Smile` button had no `onClick` at all,
  just a "coming soon" tooltip. Wired it to the same `QUICK_EMOJIS` grid pattern already working
  in `FeedCommentSheet.tsx`.
- Five items were already fixed by code from the previous sprint but never marked resolved:
  story-pause-while-replying, mobile feed back button, profile-change propagation, group-admin
  message delete, and download+share-to-group. Verified each is actually present in the live
  codebase via grep before marking resolved — none were re-built.

## Commit 2 — UI/UX

- **"Navbar should be a dropdown menu on mobile and tablet configurations."** `Navbar.tsx`'s
  compact layout switched on at `md` (768px), but `NavSearch` was already gated to `lg` (1024px)
  — tablets fell into a broken middle ground: the full cramped desktop nav, with no search bar at
  all. Moved every breakpoint in `Navbar.tsx` and `MobileNavSearch.tsx` from `md` to `lg`, and
  restyled the hamburger panel from a full-width slide-down band into an actual anchored dropdown
  under the hamburger button.
- **"Everywhere that emoji where used instead of icons should be changed to icons."** Swept
  structural (non-user-generated) emoji to lucide icons: `NotificationBell`'s 25-entry
  notification-type map, `BetaFeedback`'s type selector and floating button, `AdminFeedbackTab`'s
  type badges, and `SettingsTab`'s six notification-category headers. Left alone: toast copy,
  emoji reaction pickers, placeholder example text, and the reader-theme `<select>`'s 💎 markers
  (a native `<option>` can't render an icon).

## Commit 3 — quick suggestions (under 30 minutes each)

- **"Creators should be able to stop people from downloading their videos, pics, or posts by
  toggling it in profile settings"** (the other half of a suggestion whose tap-to-pause/seek half
  was already built in the previous sprint). Added `UserProfile.disableDownloads`, a Creator
  Settings toggle in `SettingsTab.tsx`, denormalized the flag onto each new `CreatorPost` at write
  time (same convention as `isVerified`/`isPlatinum`), and gated `FeedShareSheet`'s Download
  button on it (the post's own author can still always download their own work).
- **"...and also a clear conversation button"** (the other half of a suggestion whose
  delete-conversation-from-list half was already built). Added `clearConversationForUser()` —
  batch-marks every message in a thread `deletedFor: arrayUnion(uid)` for the caller only, the
  same per-user mechanism single-message "delete for me" already uses — wired to a new small menu
  on the open thread's header. No firestore.rules change needed: the existing "delete for me"
  carve-out already allows any participant to touch only the `deletedFor` field.
- **"Add a plus icon floating in our home screen so we can add stories with it too."** Added a
  floating "+" button on the signed-in home view (`HomeClient.tsx`) that opens the same
  `StoryCreateModal` the existing "Your Story" circle does — that circle's own tiny "+" badge is
  easy to miss, so this is a second, more discoverable entry point. Placed bottom-**left** rather
  than bottom-right, since `BetaFeedback`'s floating pill already occupies that exact bottom-right
  spot.
- **"@zamyilton should be the only one with a golden verified symbol. He created this."** Not
  implemented. The gold checkmark is the platform's Founder-tier badge (`isFounder`), already also
  worn by the actual `admin@ileotaku.com` account — restricting it to one specific creator
  contradicts that design and isn't something a single user's preference should override.
  Noted here rather than built; marked resolved (reviewed and dispositioned) rather than left
  open.

## Commit 4 — remaining suggestions

- **"Allow users add stories with captions, exactly like WhatsApp. When read more is tapped, it
  pauses the story."** Added `Story.caption` (image/video stories only — a text story's own
  `textContent` already serves this purpose), a caption input in `StoryCreateModal.tsx`'s preview
  step, and a bottom-overlay caption in `StoryViewer.tsx` with a `line-clamp-2` + "Read more"
  toggle that pauses/resumes the story exactly the way the reply input's own focus already does
  (same ref-based pause-guard pattern, `captionExpandedRef`).
- **"Allow free users to buy 1hr ads free with coins."** Added `UserProfile.adsFreeUntil` and
  `lib/ads.ts`'s `isAdsFree()` — true for a real Platinum account OR a free account inside a
  purchased window — which every ad component (`MonetagScript`, `PropellerAdsScript`,
  `ReaderAdScript`, `AdSlot`, `NextChapterCard`) now checks instead of `isPlatinum` directly, so
  the purchase actually suppresses ads everywhere Platinum's own status already does. Buying more
  time while a window is already running extends it rather than restarting it. Added the purchase
  card (30 coins/hour) to `/pricing`'s coin section.
- **"The post section on user's profile should just be small cards and not the entire post...
  like tiktok's... Tapping one would open the post with a back arrow button top left and
  scrolling takes you to the next post."** Rebuilt the Posts tab on the public creator profile
  (`CreatorProfileTabs.tsx`, the only place this applied — `/profile/[uid]` doesn't show a Posts
  tab at all) as a 3-column grid of small preview cards (`PostGridCard.tsx` — thumbnail, video
  badge, like count). Tapping one opens `CreatorPostsViewer.tsx`: the exact same TikTok-style
  `TikTokFeedItem` `/feed` itself renders (likes/comments/share/save, video controls, badges, all
  of it for free) in its own snap-scroll stack, scoped to just this creator's posts and jumped to
  the tapped card, with a back-arrow button top-left.
- **"Links should be clickable, show the preview and should be formatted to be shorter"** (the
  clickable+shortened half was already built in the previous sprint, via `MentionText.tsx`'s
  `shortenUrlLabel`). Added the "show the preview" half: a new `/api/link-preview` route that
  fetches the target page's own HTML and extracts its Open Graph tags (no third-party unfurl
  service or API key — this was buildable without new infrastructure, unlike the item below) with
  a basic SSRF guard (http/https only, rejects obviously-internal hostnames), and
  `LinkPreviewCard.tsx`, wired into DM message bubbles in `MessagesClient.tsx` (the page this
  feedback was reported from).
- **"Admin should be able to mark users as verified... and unverify them"** — already built and
  confirmed working (see the second commit of the previous sprint's investigation). **"Verification
  should also automatically remove after 6 months of ... being inactive"** — **not built, noted
  here as infra-blocked.** This needs a recurring scheduled job (a cron trigger) checking every
  verified account's `lastActiveAt` on some regular cadence and unverifying the stale ones — there
  is no cron/scheduled-task infrastructure running on this project today. The repo does have a
  `functions/` directory, but it's explicitly documented there as legacy/superseded (its one
  function is redundant with a Next.js API route the app actually uses) and deploying a *new*
  Cloud Function requires confirming the Firebase project is on the Blaze plan, which isn't
  something I can verify or change myself. A Vercel Cron Job calling a new authenticated API route
  is the more natural fit for this app's actual architecture, but committing to a specific
  schedule/plan tier without being able to confirm Vercel Cron is available and enabled on this
  project's plan risks shipping something that silently never runs. Flagging for a follow-up
  session with that confirmed rather than guessing.

## Build status (this pass)

`npx tsc --noEmit`: 0 errors. `npm run build`: clean, all 26 routes (27 including the new
`/api/link-preview` route).

---

# Pricing overhaul, voice notes, creator payouts & beta-feedback triage

Every unresolved item in Admin → Feedback (20 at the start of this pass) was read and triaged.
Statuses below reflect what was actually done and verified, not what was hoped for.

## Resolved

| Feedback | What happened |
|---|---|
| "Voicenotes keep sending the first voice note I recorded per user" | Fixed earlier (unique Cloudinary filename per recording, `uploadVoiceNote`); deployed. |
| "Posts image and video preview showing broken images" | Stored `videoPosterUrl` values 404 (`/image/upload/so_auto/`). `PostGridCard` now derives the poster from `videoUrl` (`/video/upload/so_auto/…jpg`, verified 200 on real posts). Deployed. |
| "All 10 bubble styles are the same" | Tailwind was purging the interpolated `bubble-style-N` classes. Safelisted + rewritten as `.message-bubble.bubble-style-N`; live CSS now contains all 12 rules. |
| "The select button for spotify sounds still doesn't work" | Spotify removed `preview_url` for third-party apps (Nov 2024), so this can't work. The Spotify tab was already removed from `SoundPicker`; library + own-upload sounds remain. |
| "Add inline activity messages in DMs (angie missed a call; joined; left)" | Joined/added/left already existed. Added the missing call lines: "📞 Missed voice call from X", "📞 Voice call declined", "📞 Voice call · m:ss" (duration now measured from answer, not from ringing). |
| "The create post modal is too far down, bring it up to the middle" | `Modal` gained a `centered` prop (default unchanged); Create Post uses it instead of docking to the bottom on phones. |
| "Story videos should fit the viewport… and the reply should always be on the video" | Media layer now fills the whole story card; the reply bar (and viewer count) overlays the bottom of the video. Portrait/square clips fill the screen, landscape clips stay uncropped. |
| "Next time she logs in, popup of an ice cream with confetti, 'From Zamy'" | New one-time `GiftPopup` driven by a `pendingGift` field on the profile (cleared after it's shown). Set on that user's profile. |
| "Voice note issue" / voice notes stop early / timer shows 00:00 | See the voice-recorder rewrite below. |
| Compliment ("peak build") | Acknowledged. |
| "Maybe you should get a girl named angel ice cream 👀" | Not actionable as a code change (see the gift popup above for the fun version). |

## Deliberately left open (with reasons)

- **"White verification 1k/month… Platinum 2k… scale everything down… time-based Platinum (₦200/hour, max 5h/week)"** — the pricing overhaul and the ₦1,000/month white-verification renewal are done. **Hourly Platinum is not built:** it needs a new purchase flow, a weekly-hours cap, and reliable sub-hour expiry of the Platinum flag, and nothing today sweeps `platinumUntil` on a sub-hour cadence. Left open.
- **Verified-tier reach algorithm / "only verified creators earn" / posting-consistency rules** — a large product design (per-tier reach percentages, consistency requirements, boost reach bands), not a 20-minute change. Also conflicts with the published Creator Agreement, which says all creators earn. Needs a spec conversation first.
- **Telegram-style preview + caption before sending voice notes/files, custom video controls** — a new compose-and-review flow across several attachment types. Not started.
- **HD/2K/4K should AI-enhance or downscale media** — needs server-side media processing; the Cloudinary transformations exist but AI upscaling is a paid add-on and a real design decision.
- **Profile photo cropping + cover photos (not just colours)** — needs a crop UI plus cover-image plumbing through every profile surface. Not started.
- **"Can't hear each other on calls" / "hear ourselves for 5 seconds" (×3)** — ICE candidate queueing, audio-element remount and mic-status fixes are deployed, but a real two-person call has not been tested, and TURN credentials (Metered.ca) still have to be added to Vercel. **Not marked resolved until someone confirms audio on a real call.**
- **"Notifications should push to devices like WhatsApp" / "I still don't get notifications"** — investigated, not a code bug: the push pipeline works (both stored FCM tokens validate), but only **2 of 14 accounts have ever enabled notifications**, so most people can't be pushed to at all. iOS additionally needs the PWA installed. Added a heads-up when you call someone with no push enabled. The custom notification chime already exists. Left open: it needs an opt-in campaign, not a fix.

## Voice recorder rewrite (`components/messages/VoiceRecorder.tsx`)

Root causes found (not the ones assumed): the duration passed to `onSend` was read from a stale
render (always 0 → every sent note read 0:00); release was detected with `onMouseLeave` on a bar
that replaced the button under the pointer, and on touch `touchend` fires on the unmounted button
and never arrives; the blob was always labelled `audio/webm`. Now: window-level pointer listeners,
wall-clock timer, real mime type, 250ms timeslice, tap-to-lock for long (Platinum) recordings, and
limits of 1:30 (everyone) / 10:00 (Platinum) with a red "Ns remaining" bar for the last 10 seconds.

## Pricing (all constants live in `lib/payments.ts`, `lib/creatorFeed.ts`, `lib/contentLocking.ts`)

Platinum ₦2,000/mo, ₦20,000/yr (17% off), student ₦1,000, family ₦4,500; coin packs ₦300 / ₦700 /
₦1,500 / ₦3,500; Platinum with coins 200 / 1,800; chapter unlocks 3 (skip-the-ad option, new) / 8 / 15;
boosts 20 / 60 / 200; image resolution HD 5, 2K 10, 4K 20; ads-free hour 5; white verification 1,000
coins / 30 days. **Video resolution costs were not changed** (720p 15 / 1080p 30 / 2K 60 / 4K 120) —
the spec's "was" values only match the image tiers.

## Creator payout system — decisions that need your confirmation

- **`COIN_TO_NGN = 6`, not the spec's 15** (`lib/earningsConfig.ts`). At the new pack prices a coin sells for ₦6 (smallest pack) down to ~₦4; paying ₦15 × 70% = ₦10.50/coin would pay creators more than the platform ever collected. One line to change.
- **Split percentages** follow the payout spec (unlocks 70%, tips 65%, ads 60%, Platinum pool 70%) **but do not match the published Creator Agreement page** (70 / 85 / 60 / 0% for feed ads). Reconcile before the first real payout.
- **Platinum pool size (30% of Platinum revenue) is a placeholder** — the spec never defines it. Shared by creators' proportion of Platinum members' reads; self-reads excluded.
- **Ad revenue is ₦0 for everyone** — no ad network attributes revenue to creators yet. It reads `creatorAdRevenue/{period}_{uid}.grossNGN` if finance records it; otherwise use the adjustment field.
- **Tip coins are already credited to the creator's coin balance** when the tip is sent; the payout also pays tips in Naira. Decide whether tip coins should stop being credited, or tips should be left out of cash payouts, or you'll pay twice.
- The transfer route takes the caller's identity from their verified ID token, not from the request body (`adminUid` in the spec would be forgeable), requires a Super Admin, and refuses to let the person who prepared a run approve it.
- No retry for individually failed transfers yet (references are deterministic, so a plain re-send can't double-pay, but a failed creator needs a new reference). Handle via next month's adjustment for now.

---

# Voice-note rebuild, media preview before sending, DM polish, more feedback

## Voice notes — root cause and rebuild
The app was **already** recording entirely in memory and uploading only after the recording finished (verified last
pass with a real 90-second headless run), so uploading-while-recording was not what cut recordings short. The real
weakness was that *ending* a recording was coupled to detecting a pointer **release** (hold-to-record), which behaves
differently on every phone (`touchend` on an unmounted button, `pointercancel` from a browser gesture, a context menu
on long-press). The rebuild removes that coupling completely:

- `lib/voiceRecorder.ts` — standalone `VoiceRecorder` class (start / stop / cancel, wall-clock timer, live level for the
  waveform). A recording ends only via `stop()`, `cancel()` or reaching the length limit — never an input event.
- `hooks/useVoiceNote.ts` + `components/messages/VoiceNoteBars.tsx` — idle → recording → **preview** → send. Press the
  mic to start; releasing does nothing; tap Stop → preview (play/pause, real waveform, duration) → Send uploads.
  Swipe left 80px+ (from the initial press *or* by dragging the recording bar), or tap the trash, to cancel.
- The mic button now lives in the **input row** — `[Attach] [Input] [Emoji] [Mic | Send]` — and is removed from the
  attachment tray. Mic shows when the field is empty, Send when it has text; never both.
- Upload happens only on Send, behind an optimistic **"Sending... 45%"** bubble (`PendingBubble`), which becomes the real
  message, or turns into Retry / Delete if the upload fails.
- Limits unchanged: 1:30 for everyone, 10:00 for Platinum; reaching the limit stops into the preview (never auto-sends).

## Media preview before sending
`MediaPreviewModal`: photos (swipeable gallery, remove individual photos, add more, up to 10), video (muted autoplay,
custom controls, duration), file (icon, name, type, size), and a caption for all of them. Camera captures go through it
too. Several photos are sent as **one** message (`mediaUrls`) rendered as a 2×2 grid; caption goes on the first message.

## Messages as received
- Voice: `[▶] [real waveform] [0:42]`, bars fill and animate while playing, time shows position while playing and total
  when idle. **Fixed a bug**: MediaRecorder audio has no duration header (`audio.duration` is `Infinity`), so the progress
  fill never moved; it now measures against the saved duration.
- Photos: single photo keeps its aspect ratio (max 300px tall); tap → fullscreen viewer with pinch-to-zoom, double-tap,
  wheel/trackpad zoom, pan, swipe/arrow browsing. **Fixed a bug found while testing**: media boxes with only an
  aspect-ratio collapsed to 0×0 inside a shrink-wrapped bubble, so inline video would not have rendered at all.
- Video: poster + play button + duration badge (top-right); tap plays inline muted with **our own controls**
  (play/pause, scrub, remaining time, unmute, fullscreen) instead of the browser's.

## Other feedback fixed
- **Profile photo cropping + cover photos** — `ImageCropModal` (drag, slider/wheel/pinch zoom, exact canvas crop);
  avatar upload now opens the crop step; cover picker gained "Upload cover photo" (cropped 3:1) and "Remove photo".
- **Calls**: a caller who cancelled a ringing call left the callee's incoming screen up forever (and answerable) — fixed;
  unanswered outgoing calls now ring out after 45s and log "Missed voice call".
- **Push notifications**: DMs sent **no push at all** — now the first unread message pings the recipient (muted
  conversations excluded); call pushes use the real `INCOMING_CALL` type with the caller's name, high urgency and a
  60-second TTL, and stay on screen until answered; the enable-notifications prompt now says "messages and calls" on
  the Messages page.

## Still open (with reasons)
- **Hourly Platinum (₦200/h, 5h/week), verified-tier reach algorithm, AI enhancement for HD/2K/4K, group verification
  pricing (₦1,000 / ₦1,500 / ₦2,000 per month)** — each is a product design or new billing system, not a
  20-minute change; the group-verification pricing also contradicts the earlier "creator/publisher verification is
  permanent" rule and needs a decision first.
- **Call audio on real networks / "hear ourselves for 5 seconds"** — a genuine two-party call between two browsers
  now passes end to end (ICE connected, audio flowing both directions with real signal energy, survives minimize/restore),
  but that is host-to-host on one machine. Calls across carrier NATs still depend on the Metered TURN credentials being
  added to Vercel, and the echo report can't be reproduced without two physical devices.
- **"I still don't get notifications"** — the gaps found in code are fixed (above), but delivery to a specific device
  can only be confirmed on that device after enabling notifications.

---

# Watermark on download only, Telegram-style DM media, Keep Message

## Watermark moved from upload to download
- `VideoUploader` no longer processes anything: videos upload to Cloudinary exactly as picked. `lib/videoWatermark.ts` deleted.
- `lib/videoDownload.ts`: `downloadVideoWithWatermark` stamps the ÍléOtaku eye + name + the creator's @handle in the bottom-right of the *downloader's* copy, in the browser (canvas + MediaRecorder, original audio kept, silently — nothing plays out loud). It records in real time, so it takes as long as the video; keep the tab open. Output is WebM (MP4 on Safari). Also `downloadMediaDirect` for everything that must stay untouched.
- `hooks/usePostDownload.ts` is the single download path for feed posts (three-dot menu **and** the share sheet, so there's no unmarked back door). Videos are watermarked unless the **post author's** "Add watermark to downloads" setting is off (read from their profile); photos are never watermarked; posts with downloads disabled hide the option for everyone but the author.
- DM downloads (message menu, video player, photo viewer) always use `downloadMediaDirect`: never watermarked.
- **Not undone:** videos uploaded before this change already have a watermark burned into the file (they were re-encoded at upload); those can't be restored.
- The old settings toggle was repurposed: "Add watermark to downloads".

## Telegram-style DM media
- `DMImageMessage`: one rounded card, caption laid over the bottom, skeleton until loaded, "Unavailable" tile on a broken image, fullscreen viewer with Download. Layouts: 1 full width · 2 side by side · 3 = one wide + two · 4 = 2×2 · 5+ = 2×2 with "+N". The card has an explicit width — a box sized only by aspect-ratio collapses to 0 wide in a shrink-wrapped bubble.
- `DMVideoMessage`: never has `controls` (plus no PiP / native download menu). Tap to play/pause, auto-hiding controls, seek bar, mute, time, fullscreen, Download (original). The shared-media gallery (`ConversationMediaClient`) still had a native `<video controls>`; replaced with a poster tile that opens our player.
- Photo/video messages are edge-to-edge in their bubble (caption inside the media, no longer repeated as text below).

## Keep Message (disappearing chats only)
- `keepMessage` / `unkeepMessage` (transactions) set `isKept` / `keptBy`; `subscribeToConversation` skips the expiry filter for `isKept` messages. A message stays kept until *nobody* keeps it.
- Menu "Keep / Unkeep Message", the solid bookmark on kept messages, and "Kept Messages" in the conversation menu only exist when the chat has disappearing messages on. A conversation without it shows no bookmark anywhere.
- **Firestore rules changed** (deployed): a participant may update only `isKept`/`keptBy`, and may only add/remove their *own* uid. Verified against the real rules: adding someone else's uid, smuggling another field, and a non-boolean `isKept` are all denied.
- Note: keeping is per-person in `keptBy`, but a message kept by *anyone* survives for *everyone* (as specified). In the Kept Messages panel you can only unkeep what you kept; messages kept by someone else show who's holding them.

---

# Voice-note limits, pricing overhaul, reach algorithm, AI photo enhancement, group verification, ad redo & the rest of the beta feedback

Thirteen items were open in Admin → Feedback (not eleven). An automated session can't type the admin password into a browser, so the queue was read (and is resolved) with the admin SDK instead.

## Voice notes
The limits were already in code (free 90s, Platinum 600s, chosen when recording starts from `profile.isPlatinum`). What was missing was the readout: the recording bar now shows **`0:42 / 1:30`** (Platinum **`0:42 / 10:00`**) and a **`Max 1:30`** / **`Max 10:00`** label that stays visible on phones (the old limit bar was hidden below `sm`). Auto-stop fires at the user's own limit.

## The 13 feedback items

### 1 · Pricing — "White Verifications should be bought for 1k per month… Platinum should be 2k… time based platinum, 1hr is 200 naira, max 5 hours per week… scale down coins"
- Platinum monthly was already ₦2,000. **White verification: ₦1,000/month by card or 100 coins** (it was 1,000 *coins* ≈ ₦10,000, five times Platinum's own coin price; everything now sits on the ₦10/coin rate Platinum already used). Buying needs **no application**.
- **Platinum by the hour**: ₦200 (20 coins) per hour, at most 5 hours a week (Mon–Sun UTC), stacking onto a running window. `lib/payments.ts` (`purchasePlatinumHours`), `components/pricing/PlatinumHours.tsx`.
- Hourly Platinum has to actually end: `enforcePlatinumExpiry` (`lib/verification.ts`) switches it off on the owner's next load. *Not changed:* monthly/annual Platinum still never expires client-side; that was already true and is a separate decision.

### 2 · Reach algorithm — "Only verified creators earn… everyone can post… Gold seen by every user, purple by majority, blue followers + small %, white followers + little %, unverified mostly following…"
`lib/feedAlgorithm.ts` (pure functions, one file). A stable hash of (viewer, post) decides visibility, so a viewer always gets the same answer and the audience converges to the tier's share: Gold (Founder) 100% / 80% / 60%, never below 60 · Purple ~55–75% · Blue ~10–20% outside followers · White ~4–10% · Unverified followers only, except ~8% of consistent unverified posts are pushed to 80%. Consistency (Purple none, Blue 1 post/14 d, White 1 post/30 d, Unverified 2 posts/3 d) is computed at publish time. Boosts: purple 45–50%, blue 25–35%, white 12–22%, unverified 5–10%, scaled by boost level. Followers always see followed authors; authors see their own. Checked by simulation (20k viewers). **Everyone can post** (composer gate and the `forYouEligible` rule relaxed to "not banned"). **Only verified creators earn**: `computeCreatorEarnings` returns zero, and payout batches skip, unless the account is a verified Creator/Publisher or Founder/Admin. Verification requirements are "simple but difficult": 30-day-old account, 500 followers, 25 posts, posted in 3 of the last 4 weeks (constants in `lib/verification.ts`, checklist on the application). For You paging was reworked because the filter can shrink a page (`FeedPage.exhausted`).

### 3 · "The HD 2K & 4K features should use an ai or something to enhance… If it's 4k and 720 is picked, it should reduce quality to 720"
The tier was only a label. `lib/mediaQuality.ts` turns it into delivery: photos below the target are AI-upscaled with Cloudinary `e_upscale` (confirmed enabled: a 74 KB image came back as 898 KB), guarded to sources under 4 MP; larger ones are scaled down to the target. Videos are scaled **down** to the tier but **not** upscaled: there's no AI video enhancer available to us, and stretching a short clip to 4K produced a 43 MB file with no added detail. Every derived URL falls back to the original on error, and photo tiers are pre-generated at post time so the first viewer doesn't wait ~10 s.

### 4 · "Implement group verifications… group admins can apply… admins can grant… 1000 / 1500 / 2000"
A group **admin** applies with a reason (`lib/groupVerification.ts`, group info panel); a platform admin approves or rejects in Admin → Verification (`AdminGroupVerificationSection`); approval sets `verifiedGroup`, which shows a badge beside the group name. New rules: `groupVerificationRequests`, and a platform admin may flip only `verifiedGroup`. Pricing: white ₦1,000 · Creator ₦1,500 · Publisher ₦2,000 per month (100/150/200 coins). Creator/Publisher approvals now start a 30-day window and renew like white; badges granted before monthly billing (no expiry stored) stay permanent. Group verification itself is free, granted by an admin.

### 5 · "The crop for cover photo works but the output isn't my cropped photo"
The crop is 3:1 but the banner had a fixed height (200 px, or 160–256 px on the other pages), so on a phone (328×200 ≈ 1.6:1) `background-size: cover` cut the sides off the already-cropped image. All three banners (`/profile`, `/profile/[uid]`, `/creator/[handle]`) are now `aspect-[3/1]`.

### 6 · "group founder can't de-admin other admins… add member tags"
`removeGroupAdmin` (founder only, never the founder) plus "Remove Admin" in the member menu. `memberTags` (≤20 chars, set/cleared by admins) show as a pill in the member list and above that member's messages; `memberTags` was added to the group-update rule.

### 7 · "Let's redo ads… strictly between chapters… watch ad for coins (5/day, 1–10, rigged 3–6)… watch 3 ads to unlock the next chapter (2/day)… watch 3 ads; only 4 ads per day"
Popup/floating script ads removed (`ReaderAdScript`, `MonetagScript`); the between-chapters slot shows ÍléOtaku's own creative. New server-verified rewarded ads (`app/api/ads/*`, `lib/server/adRewards.ts`, rules in `lib/adConfig.ts`): the browser can't skip or forge an ad. The server checks that the full 15 s passed on *its* clock, that the session is unclaimed and the caller's, and the daily caps, then pays out in the same transaction. Coins 5/day (weights make 3–6 come up 80% of the time), a chapter unlocks after 3 ads with 2 chapters/day, and 3 ads (4/day cap) give 1 hour of Platinum. The old "Skip Ad after 5 s" gate, which unlocked a chapter with a client-side write, is gone. **Not done:** no third-party ad network is connected (needs an account/approval); the inventory is our own promos until one is.

### 8 · "We need a clear library button and select book feature to remove particular books from library and history"
Library: **Select** (tap covers to tick, Remove, Select all) and **Clear library**. History: **Select** with bulk delete (it already had per-item, clear-older-than and clear-all). `removeFromLibrary` addresses each progress key with a `FieldPath` because manga ids can contain dots.

### 9 · "When I update display name, it should update everywhere… and stop switching to the old one on every deploy"
Root cause of the revert: `signInSocial` wrote the provider's (Google's) name and photo over the saved profile on **every** sign-in of an existing user, and a deploy makes everyone sign in again. It now only fills empty fields. Propagation previously reached only posts, series and conversations from the browser; a new server route (`/api/profile/propagate`) re-stamps posts, feed comments, series comments, stories, saved-post snapshots, series and conversation member lists, reading the name from the caller's own profile (never the request body). It needed collection-group index overrides for `comments.uid`, `comments.userId` and `savedPosts.uid` (deployed).

### 10 · "Mobile view of dms… the name, username, verification and everything is jammed up there"
On a phone the name keeps the first line (ellipsis, badges never squashed), the @handle moves under it beside the status, header padding is tighter, the Spotify strip is hidden and Block moves into the ⋯ menu.

### 11 · "The dm video viewport should frame the video properly… right now it's cropping"
The card was forced into the stored shape (16:9 when none), clamped to 0.7–1.8, with `object-cover`. It now uses the clip's real shape (read from the video's metadata when the message has none), clamps to 0.6–2 and letterboxes with `object-contain`, so nothing is cut off.

### 12 · "the color picked for dms bubble should be the same for the voice note icon… missed calls and other inline messages should show timestamps"
Voice bubbles draw the play disc and waveform from the sender's picked colour. Inline system messages (missed call, group-call lines, …) show the time in small muted text below.

### 13 · "Change the ringtone to our own ringtone… notifications can have the chimes but ringtones different"
`lib/ringtone.ts`: an original synthesized bell motif (G-major arpeggio up and back, ~2.6 s loop) for incoming calls and a softer two-tone ringback for the caller, wired into the 1:1 call screen and both group-call screens. Incoming-call notifications no longer play the notification chime.

## Error logs
473 of 478 open errors were resolved with per-group notes (old permission errors fixed by rules long ago, offline / "Failed to fetch" noise, the keep/unkeep permission errors fixed by last sprint's rule deployment, and so on). Blocking a user no longer logs "no document to update" for a deleted target. **5 left open on purpose:** `NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured`. Web push needs a key pair generated in the Firebase console and added to Vercel.

## Not done, and why
- AI **video** upscaling: no such service available to us (item 3).
- A real ad network: needs an account and approval (item 7).
- Paystack card flows (hourly Platinum, ₦1,000 verification): implemented, but the card popup can't be automated.
- Web push key (VAPID): Firebase console + Vercel env.
