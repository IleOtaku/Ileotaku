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
