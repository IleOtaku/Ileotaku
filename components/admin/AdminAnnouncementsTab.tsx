"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Megaphone } from "lucide-react";
import { getAnnouncements, sendAnnouncement } from "@/lib/admin";
import { Skeleton } from "@/components/ui";
import { formatTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Announcement, AnnouncementTarget } from "@/types";

const TARGET_OPTIONS: { label: string; value: AnnouncementTarget }[] = [
  { label: "Everyone", value: "everyone" },
  { label: "Platinum Only", value: "platinum" },
  { label: "Creators Only", value: "creators" },
  { label: "Publishers Only", value: "publishers" },
];

/** Compose + send platform-wide announcements, with a live preview and a history of past sends. */
export default function AdminAnnouncementsTab() {
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<AnnouncementTarget>("everyone");
  const [deliverInApp, setDeliverInApp] = useState(true);
  const [deliverHomeBanner, setDeliverHomeBanner] = useState(false);
  const [deliverCriticalModal, setDeliverCriticalModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [past, setPast] = useState<Announcement[]>([]);
  const [pastLoading, setPastLoading] = useState(true);

  useEffect(() => {
    getAnnouncements()
      .then(setPast)
      .catch(() => setPast([]))
      .finally(() => setPastLoading(false));
  }, []);

  async function handleSend() {
    if (!title.trim() || !body.trim() || !profile) return;
    setSending(true);
    setProgress({ sent: 0, total: 0 });
    try {
      const recipientCount = await sendAnnouncement(
        {
          title: title.trim(),
          body: body.trim(),
          target,
          deliverInApp,
          deliverHomeBanner,
          deliverCriticalModal,
          sentBy: profile.uid,
          sentByName: profile.displayName,
        },
        (sent, total) => setProgress({ sent, total })
      );
      toast.success(`Sent to ${recipientCount.toLocaleString()} users.`);
      setPast((prev) => [
        {
          id: `temp-${Date.now()}`,
          title: title.trim(),
          body: body.trim(),
          target,
          deliverInApp,
          deliverHomeBanner,
          deliverCriticalModal,
          sentBy: profile.uid,
          sentByName: profile.displayName,
          recipientCount,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTitle("");
      setBody("");
    } catch {
      toast.error("Couldn't send this announcement. Please try again.");
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
          <h3 className="mb-4 font-syne text-sm font-semibold text-text">Compose Announcement</h3>

          <div className="flex flex-col gap-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="input-base"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What's the announcement?"
              className="input-base resize-none"
            />

            <div>
              <p className="mb-2 font-syne text-xs font-semibold text-muted">Target audience</p>
              <div className="flex flex-wrap gap-1.5">
                {TARGET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTarget(opt.value)}
                    className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                      target === opt.value ? "border-clay bg-clay text-ivory" : "border-muted2 text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 font-syne text-xs font-semibold text-muted">Delivery</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-noto text-xs text-text">
                  <input type="checkbox" checked={deliverInApp} onChange={(e) => setDeliverInApp(e.target.checked)} className="h-3.5 w-3.5 accent-clay" />
                  In-app notification
                </label>
                <label className="flex items-center gap-2 font-noto text-xs text-text">
                  <input type="checkbox" checked={deliverHomeBanner} onChange={(e) => setDeliverHomeBanner(e.target.checked)} className="h-3.5 w-3.5 accent-clay" />
                  Home banner
                </label>
                <label className="flex items-center gap-2 font-noto text-xs text-text">
                  <input type="checkbox" checked={deliverCriticalModal} onChange={(e) => setDeliverCriticalModal(e.target.checked)} className="h-3.5 w-3.5 accent-clay" />
                  Critical modal
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {sending
                ? progress && progress.total > 0
                  ? `Sending to ${progress.sent.toLocaleString()} / ${progress.total.toLocaleString()} users...`
                  : "Sending..."
                : "Send Announcement"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Past Announcements</h3>
          {pastLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : past.length === 0 ? (
            <p className="font-noto text-xs text-muted">Nothing sent yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {past.map((a) => (
                <div key={a.id} className="rounded-xl border border-bg4 bg-bg3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-syne text-sm font-semibold text-text">{a.title}</p>
                    <span className="shrink-0 font-noto text-[10px] text-muted">{formatTime(a.createdAt)}</span>
                  </div>
                  <p className="mt-1 font-noto text-xs text-muted">{a.body}</p>
                  <p className="mt-2 font-noto text-[11px] text-muted">
                    {TARGET_OPTIONS.find((t) => t.value === a.target)?.label ?? a.target} · {a.recipientCount.toLocaleString()} recipients
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg">📢</span>
            <div className="min-w-0">
              <p className="font-syne text-sm font-semibold text-text">{title || "Announcement title"}</p>
              <p className="mt-1 font-noto text-xs text-muted">{body || "Announcement body will appear here."}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
