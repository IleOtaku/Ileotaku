"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Bug,
  Copy,
  Crown,
  Download,
  Gift,
  KeyRound,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldOff,
  Sparkles,
  UserX,
} from "lucide-react";
import { Modal, Select, Skeleton, Toggle } from "@/components/ui";
import { SpotifyGlyph } from "@/components/spotify/NowPlayingCard";
import { useAuth } from "@/hooks/useAuth";
import { deleteMyAccount, friendlyError, resetPassword } from "@/lib/auth";
import { subscribeToBlockedUsers, unblockUser } from "@/lib/blocking";
import { getHistory, getUserProfile, updateUserPrefs } from "@/lib/firestore";
import { getMyBugReports } from "@/lib/admin";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from "@/lib/fcm";
import { connectSpotify, disconnectSpotify, getSpotifyDisplayName } from "@/lib/spotify";
import { formatTime, initials, stringToColor } from "@/lib/utils";
import type {
  BugReport,
  NotificationPreferences,
  ReaderTheme,
  ReadingPreferences,
  UserProfile,
} from "@/types";
import { PLATINUM_READER_THEMES } from "@/types";

const THEME_OPTIONS: { label: string; value: ReaderTheme }[] = [
  { label: "Dark", value: "dark" },
  { label: "Sepia", value: "sepia" },
  { label: "Midnight 💎", value: "midnight" },
  { label: "Sakura 💎", value: "sakura" },
  { label: "Matrix 💎", value: "matrix" },
];

const INACTIVITY_OPTIONS: { label: string; value: string }[] = [
  { label: "1 month", value: "1" },
  { label: "3 months", value: "3" },
  { label: "6 months (default)", value: "6" },
  { label: "8 months", value: "8" },
  { label: "12 months", value: "12" },
  { label: "Never", value: "never" },
];

const DEFAULT_PREFS: ReadingPreferences = {
  mode: "scroll",
  theme: "dark",
  autoload: true,
  showProgressBar: true,
};

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  chapterAlerts: true,
  announcements: true,
};

/** blockUser() writes `blockedAt` via serverTimestamp(), so a freshly-read doc holds a real
 * Firestore Timestamp (with a `.toDate()` method) rather than the ISO string every other
 * "*At" field in this app uses — handle both shapes rather than assuming one. */
function formatBlockedDate(value: unknown): string {
  if (!value) return "recently";
  const date =
    typeof value === "object" && value !== null && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleDateString();
}

/** Account / Spotify / Reading Preferences / Notifications / Account & Privacy / Danger Zone —
 * all read from and write to Firestore. */
export default function SettingsTab() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [spotifyName, setSpotifyName] = useState<string | null>(null);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [savingInactivity, setSavingInactivity] = useState(false);
  // Profile is null when the blocked account has since been deleted (deleteMyAccount() removes
  // the users/{uid} doc but not other people's block records against it) — found live during
  // testing that filtering those out entirely made the block silently vanish from this list with
  // no way to confirm or clean it up, so a null profile renders a "Deleted user" fallback row
  // instead of being dropped.
  const [blockedUsers, setBlockedUsers] = useState<
    { uid: string; profile: UserProfile | null; blockedAt?: unknown }[]
  >([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const [taglineDraft, setTaglineDraft] = useState("");
  const [savingTagline, setSavingTagline] = useState(false);
  const [reminderDraft, setReminderDraft] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);

  const prefs = profile?.preferences ?? DEFAULT_PREFS;
  const notifications = profile?.notifications ?? DEFAULT_NOTIFICATIONS;
  const isPlatinum = profile?.isPlatinum === true;
  const [myBugReports, setMyBugReports] = useState<BugReport[]>([]);
  const [pushStatus, setPushStatus] = useState<NotificationPermissionStatus>("default");
  const [requestingPush, setRequestingPush] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyBugReports(user.uid)
      .then(setMyBugReports)
      .catch(() => setMyBugReports([]));
  }, [user]);

  useEffect(() => {
    setPushStatus(getNotificationPermissionStatus());
  }, []);

  useEffect(() => {
    if (!user || !profile?.spotifyConnected) {
      setSpotifyName(null);
      return;
    }
    getSpotifyDisplayName(user.uid).then(setSpotifyName);
  }, [user, profile?.spotifyConnected]);

  useEffect(() => {
    setTaglineDraft(profile?.platinumTagline ?? "");
    setReminderDraft(profile?.reminderTime ?? "");
  }, [profile?.platinumTagline, profile?.reminderTime]);

  // Real-time: unblocking (from this list, a profile page, or a DM header) removes the row
  // immediately without a manual refetch. Each blocked uid's profile is fetched once per id
  // change (not itself real-time — a blocked account's display name changing mid-session isn't
  // worth a second listener per row).
  useEffect(() => {
    if (!user) {
      setBlockedUsers([]);
      setBlockedLoading(false);
      return;
    }
    setBlockedLoading(true);
    const unsub = subscribeToBlockedUsers(user.uid, (records) => {
      Promise.all(
        records.map(async (r) => ({
          uid: r.targetUid,
          blockedAt: r.blockedAt,
          profile: await getUserProfile(r.targetUid),
        }))
      ).then((entries) => {
        setBlockedUsers(entries);
        setBlockedLoading(false);
      });
    });
    return unsub;
  }, [user]);

  async function handleEnablePush() {
    if (!user) return;
    setRequestingPush(true);
    try {
      const status = await requestNotificationPermission(user.uid);
      setPushStatus(status);
      if (status === "granted") toast.success("Push notifications enabled!");
      else if (status === "denied") toast.error("Notifications were blocked.");
    } catch {
      toast.error("Couldn't enable push notifications. Please try again.");
    } finally {
      setRequestingPush(false);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    const fresh = await getUserProfile(user.uid);
    useAuth.getState().setProfile(fresh);
  }

  async function updatePrefs(next: Partial<ReadingPreferences>) {
    if (!user) return;
    setSavingPrefs(true);
    try {
      await updateUserPrefs(user.uid, { preferences: { ...prefs, ...next } });
      await refreshProfile();
    } catch {
      toast.error("Couldn't save your preferences.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function updateNotifs(next: Partial<NotificationPreferences>) {
    if (!user) return;
    try {
      await updateUserPrefs(user.uid, { notifications: { ...notifications, ...next } });
      await refreshProfile();
    } catch {
      toast.error("Couldn't save your notification settings.");
    }
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await resetPassword(user.email);
      toast.success(`Reset link sent to ${user.email}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSendingReset(false);
    }
  }

  async function handleExport() {
    if (!user || !profile) return;
    setExporting(true);
    try {
      const history = await getHistory(user.uid, 200);
      const payload = { profile, history, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ileotaku-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export has started downloading.");
    } catch {
      toast.error("Couldn't export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const referralSlug = profile?.handle || user?.uid || "";
  const referralUrl = referralSlug ? `https://ileotaku.com/ref/${referralSlug}` : "";

  async function handleCopyReferral() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success("Referral link copied!");
    } catch {
      toast.error("Couldn't copy the link — copy it manually instead.");
    }
  }

  async function handleConfirmDelete() {
    if (!user || deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await deleteMyAccount(user.uid);
      setDeleteModalOpen(false);
      toast.success("Account deleted. We're sorry to see you go.");
      router.push("/");
    } catch (err) {
      toast.error(friendlyError(err));
      setDeleting(false);
    }
  }

  async function handleConnectSpotify() {
    if (!user) return;
    connectSpotify(user.uid);
  }

  async function handleDisconnectSpotify() {
    if (!user) return;
    setSpotifyBusy(true);
    try {
      await disconnectSpotify(user.uid);
      await updateUserPrefs(user.uid, { spotifyConnected: false });
      await refreshProfile();
      setSpotifyName(null);
      toast.success("Spotify disconnected.");
    } catch {
      toast.error("Couldn't disconnect Spotify. Please try again.");
    } finally {
      setSpotifyBusy(false);
    }
  }

  async function handleShowNowPlayingToggle(v: boolean) {
    if (!user) return;
    try {
      await updateUserPrefs(user.uid, { showNowPlaying: v });
      await refreshProfile();
    } catch {
      toast.error("Couldn't save that setting.");
    }
  }

  async function handleUnblock(targetUid: string) {
    if (!user) return;
    setUnblockingUid(targetUid);
    try {
      await unblockUser(user.uid, targetUid);
      setBlockedUsers((prev) => prev.filter((b) => b.uid !== targetUid));
      toast.success("Unblocked.");
    } catch {
      toast.error("Couldn't unblock this user.");
    } finally {
      setUnblockingUid(null);
    }
  }

  async function handleShowReadingActivityToggle(v: boolean) {
    if (!user) return;
    try {
      await updateUserPrefs(user.uid, { showReadingActivity: v });
      await refreshProfile();
    } catch {
      toast.error("Couldn't save that setting.");
    }
  }

  async function handleReadingActivityVisibility(value: string) {
    if (!user || !profile?.isPlatinum) return;
    try {
      await updateUserPrefs(user.uid, {
        readingActivityVisibility: value as UserProfile["readingActivityVisibility"],
      });
      await refreshProfile();
    } catch {
      toast.error("Couldn't save that setting.");
    }
  }

  async function handleSaveTagline() {
    if (!user || !profile?.isPlatinum) return;
    setSavingTagline(true);
    try {
      await updateUserPrefs(user.uid, { platinumTagline: taglineDraft.trim().slice(0, 40) });
      await refreshProfile();
      toast.success("Tagline saved.");
    } catch {
      toast.error("Couldn't save your tagline.");
    } finally {
      setSavingTagline(false);
    }
  }

  async function saveReminderTime(value: string) {
    if (!user || !profile?.isPlatinum) return;
    setSavingReminder(true);
    try {
      await updateUserPrefs(user.uid, { reminderTime: value || undefined });
      setReminderDraft(value);
      await refreshProfile();
      toast.success(value ? `Reminder set for ${value}.` : "Reminder cleared.");
    } catch {
      toast.error("Couldn't save your reminder time.");
    } finally {
      setSavingReminder(false);
    }
  }

  async function handleInactivityChange(value: string) {
    if (!user) return;
    setSavingInactivity(true);
    try {
      const parsed = value === "never" ? "never" : (Number(value) as 1 | 3 | 6 | 8 | 12);
      await updateUserPrefs(user.uid, { inactivityDeleteAfter: parsed });
      await refreshProfile();
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save this setting.");
    } finally {
      setSavingInactivity(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Account</h3>
        <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
          <div className="flex items-center justify-between">
            <span className="font-noto text-sm text-muted">Email</span>
            <span className="font-noto text-sm text-text">{user?.email}</span>
          </div>
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={sendingReset}
            className="btn-ghost w-fit text-sm"
          >
            {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Send password reset email
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <SpotifyGlyph className="h-4 w-4" /> Spotify
        </h3>
        <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-5">
          {!profile?.spotifyConnected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-noto text-xs text-muted">
                Connect Spotify to search real tracks for your posts and show what you&apos;re
                listening to on your profile.
              </p>
              <button
                type="button"
                onClick={handleConnectSpotify}
                className="shrink-0 rounded-full bg-green-600 px-4 py-2 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-green-500"
              >
                Connect Spotify
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-noto text-sm text-text">
                  Connected as <span className="font-semibold">{spotifyName ?? "..."}</span>
                </p>
                <button
                  type="button"
                  onClick={handleDisconnectSpotify}
                  disabled={spotifyBusy}
                  className="btn-ghost text-sm"
                >
                  {spotifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Disconnect
                </button>
              </div>
              <Toggle
                checked={profile?.showNowPlaying !== false}
                onChange={handleShowNowPlayingToggle}
                label="Show what I'm listening to"
              />
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Reading Activity</h3>
        <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
          <Toggle
            checked={profile?.showReadingActivity !== false}
            onChange={handleShowReadingActivityToggle}
            label="Share my reading activity"
          />
          <p className="font-noto text-[11px] text-muted">
            Lets friends see what I&apos;m reading in real time — shown as &quot;Reading now
            📖&quot; on your profile and in their Friend Activity feed while you have a chapter
            open.
          </p>
          {isPlatinum ? (
            <div className="border-t border-bg4 pt-3">
              <Select
                label="Reading activity visibility"
                value={profile?.readingActivityVisibility ?? "everyone"}
                onChange={(e) => handleReadingActivityVisibility(e.target.value)}
                disabled={profile?.showReadingActivity === false}
                options={[
                  { label: "Everyone", value: "everyone" },
                  { label: "Followers only", value: "followers" },
                  { label: "Nobody", value: "nobody" },
                ]}
              />
            </div>
          ) : (
            <p className="flex items-center gap-1.5 border-t border-bg4 pt-3 font-noto text-[11px] text-muted">
              <Lock className="h-3 w-3" /> &quot;Followers only&quot; visibility is a Platinum
              feature — free accounts share with everyone or not at all.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Reading Preferences</h3>
        <div className="grid gap-4 rounded-2xl border border-bg4 bg-bg2 p-5 sm:grid-cols-2">
          <Select
            label="Default reading mode"
            value={prefs.mode}
            onChange={(e) => updatePrefs({ mode: e.target.value as ReadingPreferences["mode"] })}
            disabled={savingPrefs}
            options={[
              { label: "Scroll", value: "scroll" },
              { label: "Paged", value: "paged" },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reader-theme" className="font-syne text-xs font-semibold text-muted">
              Reader theme
            </label>
            <select
              id="reader-theme"
              value={prefs.theme}
              onChange={(e) => updatePrefs({ theme: e.target.value as ReaderTheme })}
              disabled={savingPrefs}
              className="input-base"
            >
              {THEME_OPTIONS.map((opt) => {
                const locked = PLATINUM_READER_THEMES.includes(opt.value) && !isPlatinum;
                return (
                  <option key={opt.value} value={opt.value} disabled={locked}>
                    {opt.label}
                    {locked ? " (Platinum)" : ""}
                  </option>
                );
              })}
            </select>
            {!isPlatinum && (
              <p className="font-noto text-[11px] text-muted">
                Midnight, Sakura and Matrix are Platinum-exclusive themes.
              </p>
            )}
          </div>
          <Toggle
            checked={prefs.autoload}
            onChange={(v) => updatePrefs({ autoload: v })}
            label="Auto-load next chapter"
            disabled={savingPrefs}
          />
          <Toggle
            checked={prefs.showProgressBar}
            onChange={(v) => updatePrefs({ showProgressBar: v })}
            label="Show progress bar"
            disabled={savingPrefs}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Sparkles className="h-4 w-4 text-plat2" /> Platinum Perks
        </h3>
        <div className="flex flex-col gap-5 rounded-2xl border border-plat/30 bg-plat/5 p-5">
          <div>
            <label htmlFor="tagline" className="mb-1.5 flex items-center gap-1.5 font-syne text-xs font-semibold text-muted">
              Custom profile tagline
              {!isPlatinum && <Lock className="h-3 w-3" />}
            </label>
            {isPlatinum ? (
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <input
                  id="tagline"
                  value={taglineDraft}
                  onChange={(e) => setTaglineDraft(e.target.value.slice(0, 40))}
                  placeholder="🌍 African Comics Enthusiast"
                  maxLength={40}
                  className="input-base flex-1"
                />
                <button
                  type="button"
                  onClick={handleSaveTagline}
                  disabled={savingTagline || taglineDraft === (profile?.platinumTagline ?? "")}
                  className="btn-ghost shrink-0 text-sm"
                >
                  {savingTagline ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-muted2 bg-bg3 px-3 py-2.5 font-noto text-xs text-muted">
                Platinum feature — add a one-line tagline shown under your handle.
              </p>
            )}
            {isPlatinum && (
              <p className="mt-1 font-noto text-[11px] text-muted">{taglineDraft.length}/40 characters</p>
            )}
          </div>

          <div>
            <label htmlFor="reminder" className="mb-1.5 flex items-center gap-1.5 font-syne text-xs font-semibold text-muted">
              Daily reading reminder
              {!isPlatinum && <Lock className="h-3 w-3" />}
            </label>
            {isPlatinum ? (
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <input
                  id="reminder"
                  type="time"
                  value={reminderDraft}
                  onChange={(e) => setReminderDraft(e.target.value)}
                  className="input-base w-auto"
                />
                <button
                  type="button"
                  onClick={() => saveReminderTime(reminderDraft)}
                  disabled={savingReminder || reminderDraft === (profile?.reminderTime ?? "")}
                  className="btn-ghost shrink-0 text-sm"
                >
                  {savingReminder ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
                {profile?.reminderTime && (
                  <button
                    type="button"
                    onClick={() => saveReminderTime("")}
                    disabled={savingReminder}
                    className="font-noto text-xs text-muted hover:text-clay2"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-muted2 bg-bg3 px-3 py-2.5 font-noto text-xs text-muted">
                Platinum feature — get a daily push reminder to read.
              </p>
            )}
            <p className="mt-1 font-noto text-[11px] text-muted">
              &quot;📖 Time to read! You have new chapters waiting.&quot; — delivered via push
              notification, so enable those above too.
            </p>
          </div>

          {!isPlatinum && (
            <Link href="/pricing" className="btn-plat w-fit text-sm">
              <Crown className="h-4 w-4" /> Unlock Platinum Perks
            </Link>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Notifications</h3>
        <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
          <Toggle
            checked={notifications.chapterAlerts}
            onChange={(v) => updateNotifs({ chapterAlerts: v })}
            label="New chapter alerts"
          />
          <Toggle
            checked={notifications.announcements}
            onChange={(v) => updateNotifs({ announcements: v })}
            label="ÍléOtaku announcements"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bg4 pt-4">
            <div>
              <p className="font-syne text-sm font-semibold text-text">Push notifications</p>
              <p className="font-noto text-xs text-muted">
                Status:{" "}
                {pushStatus === "granted"
                  ? "Enabled"
                  : pushStatus === "denied"
                    ? "Disabled"
                    : pushStatus === "unsupported"
                      ? "Not supported in this browser"
                      : "Not asked"}
              </p>
              {pushStatus === "denied" && (
                <p className="mt-1 max-w-sm font-noto text-xs text-clay2">
                  Notifications are blocked for this site. Re-enable them from your browser&apos;s
                  site settings (usually the padlock icon next to the address bar), then reload.
                </p>
              )}
            </div>
            {pushStatus !== "denied" && pushStatus !== "unsupported" && (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={requestingPush || pushStatus === "granted"}
                className="btn-ghost text-sm"
              >
                {requestingPush ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pushStatus === "granted" ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                {pushStatus === "granted" ? "Enabled" : "Enable Notifications"}
              </button>
            )}
          </div>
        </div>
      </section>

      {myBugReports.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
            <Bug className="h-4 w-4 text-gold" /> My Bug Reports
          </h3>
          <div className="flex flex-col gap-3">
            {myBugReports.map((b) => (
              <div key={b.id} className="rounded-2xl border border-bg4 bg-bg2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-syne text-sm font-semibold text-text">{b.title}</p>
                  <span className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] uppercase tracking-wide text-muted">
                    {b.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 font-noto text-[11px] text-muted">{formatTime(b.createdAt)}</p>
                {b.note && (
                  <p className="mt-2 rounded-lg border border-dashed border-gold/40 bg-gold/5 p-2 font-noto text-xs text-gold">
                    Team response: {b.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Gift className="h-4 w-4 text-gold" /> Referral Link
        </h3>
        <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-5">
          <p className="font-noto text-xs text-muted">
            Share your link — friends who sign up earn you bonus coins.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={referralUrl}
              onFocus={(e) => e.target.select()}
              className="input-base text-sm"
            />
            <button
              type="button"
              onClick={handleCopyReferral}
              disabled={!referralUrl}
              className="btn-ghost shrink-0 text-sm"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
          <div className="flex gap-6 border-t border-bg4 pt-4">
            <div>
              <p className="font-cinzel text-lg text-gold">{profile?.referralCount ?? 0}</p>
              <p className="font-noto text-xs text-muted">Referrals</p>
            </div>
            <div>
              <p className="font-cinzel text-lg text-gold2">{profile?.referralCoins ?? 0}</p>
              <p className="font-noto text-xs text-muted">Coins earned</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <ShieldAlert className="h-4 w-4 text-gold" /> Account & Privacy
        </h3>
        <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-5">
          <Select
            label="Auto-delete after inactivity"
            value={String(profile?.inactivityDeleteAfter ?? 6)}
            onChange={(e) => handleInactivityChange(e.target.value)}
            disabled={savingInactivity}
            options={INACTIVITY_OPTIONS}
          />
          <p className="font-noto text-xs text-muted">
            Your account will be permanently deleted if you don&apos;t log in within this period.
            You&apos;ll receive a warning email 2 weeks before deletion.
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <ShieldOff className="h-4 w-4 text-gold" /> Blocked Users
        </h3>
        {blockedLoading ? (
          <Skeleton className="h-16 w-full rounded-2xl" />
        ) : blockedUsers.length === 0 ? (
          <p className="rounded-2xl border border-bg4 bg-bg2 p-5 font-noto text-sm text-muted">
            ✓ You haven&apos;t blocked anyone
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-bg4 bg-bg2 p-3">
            {blockedUsers.map(({ uid: blockedUid, profile: b, blockedAt }) => (
              <div key={blockedUid} className="flex items-center gap-3 rounded-xl p-2">
                {b?.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
            loading="lazy" src={b.photoURL} alt={b.displayName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
                    style={{ backgroundColor: stringToColor(b?.displayName ?? blockedUid) }}
                  >
                    {b ? initials(b.displayName) : <UserX className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-syne text-sm font-semibold text-text">
                    {b?.displayName ?? "Deleted user"}
                  </p>
                  {b?.handle && <p className="truncate font-noto text-xs text-muted">@{b.handle}</p>}
                  <p className="font-noto text-[11px] text-muted">Blocked {formatBlockedDate(blockedAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(blockedUid)}
                  disabled={unblockingUid === blockedUid}
                  className="btn-ghost shrink-0 text-xs"
                >
                  {unblockingUid === blockedUid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-4 font-syne text-sm font-semibold text-clay2">Danger Zone</h3>
        <div className="flex flex-col gap-4 rounded-2xl border border-clay/30 bg-clay/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-syne text-sm font-semibold text-text">Export your data</p>
              <p className="font-noto text-xs text-muted">
                Download your profile and reading history as JSON.
              </p>
            </div>
            <button type="button" onClick={handleExport} disabled={exporting} className="btn-ghost text-sm">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Data
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-clay/20 pt-4">
            <div>
              <p className="font-syne text-sm font-semibold text-text">Delete account</p>
              <p className="font-noto text-xs text-muted">
                This permanently deletes your account and all your data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-red-500"
            >
              <AlertTriangle className="h-4 w-4" /> Delete Account
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteModalOpen(false);
            setDeleteConfirmText("");
          }
        }}
        title="Delete your account?"
      >
        <div className="flex flex-col gap-4">
          <p className="font-noto text-sm text-text">
            This permanently deletes your account, all your content, reading history, coins, and
            earned revenue. This cannot be undone.
          </p>
          <div>
            <label htmlFor="delete-confirm" className="mb-1.5 block font-noto text-xs text-muted">
              Type <span className="font-semibold text-clay2">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="input-base"
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteConfirmText("");
              }}
              disabled={deleting}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting || deleteConfirmText !== "DELETE"}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Delete Forever
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
