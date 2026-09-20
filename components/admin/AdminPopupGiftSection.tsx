"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import toast from "react-hot-toast";
import { Gift, Loader2, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { auth, db } from "@/lib/firebase";
import { searchUsers } from "@/lib/firestore";
import { formatTime } from "@/lib/utils";
import type { UserProfile } from "@/types";

/**
 * Super Admin → Announcements → "Popup gifts". The ice-cream surprise as a reusable tool: an emoji, an optional title
 * and a message that pops up ONCE (with confetti) the next time each recipient opens the app. Send it to everyone, to a
 * segment (Platinum / Creators / Publishers), or to specific people and/or every member of chosen chat groups.
 * The send itself happens on the server (app/api/admin/gift) — this is only the form.
 */
type AudienceKind = "everyone" | "platinum" | "creators" | "publishers" | "selected";

const AUDIENCES: { value: AudienceKind; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "platinum", label: "Platinum members" },
  { value: "creators", label: "Creators" },
  { value: "publishers", label: "Publishers" },
  { value: "selected", label: "Specific people / groups" },
];
const EMOJI_SUGGESTIONS = ["🍦", "🎁", "🎉", "💛", "🌚", "🔥", "🥳", "☕"];

interface GroupRow {
  id: string;
  name: string;
  members: number;
}
interface HistoryRow {
  id: string;
  gift: { emoji: string; title?: string; message: string };
  audience: { kind: string; userCount?: number; groupCount?: number };
  sentTo: number;
  sentByName: string;
  createdAt: string;
}

async function callGift<T>(init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/admin/gift", {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string } & T;
  if (!res.ok || data.success === false) throw new Error(data.message ?? "Something went wrong.");
  return data;
}

export default function AdminPopupGiftSection() {
  const [emoji, setEmoji] = useState("🍦");
  const [title, setTitle] = useState("An ice cream for you!");
  const [message, setMessage] = useState("From Zamy");
  const [kind, setKind] = useState<AudienceKind>("everyone");
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [people, setPeople] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());

  const [counting, setCounting] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ willReceive: number; matched: number; skippedHavingUnopenedGift: number } | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    callGift<{ gifts: HistoryRow[] }>({ method: "GET" })
      .then((r) => setHistory(r.gifts))
      .catch(() => setHistory([]));
  }, []);

  // Group chats a gift can be sent to (all members of each). Group metadata is readable by any signed-in user.
  useEffect(() => {
    if (kind !== "selected" || groups.length > 0) return;
    getDocs(query(collection(db, "conversations"), where("type", "==", "group"), limit(100)))
      .then((snap) =>
        setGroups(
          snap.docs
            .map((d) => ({ id: d.id, name: (d.data().name as string) || "Untitled group", members: (d.data().participants as string[])?.length ?? 0 }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setGroups([]));
  }, [kind, groups.length]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchUsers(q).then((r) => setResults(r.filter((u) => !people.some((p) => p.uid === u.uid)).slice(0, 6)));
    }, 250);
    return () => clearTimeout(t);
  }, [search, people]);

  // Anything the admin changes invalidates the audience count they were shown.
  useEffect(() => setPreview(null), [kind, replaceExisting, people, pickedGroups]);

  const audience = useMemo(
    () => (kind === "selected" ? { kind, userIds: people.map((p) => p.uid), groupIds: Array.from(pickedGroups) } : { kind }),
    [kind, people, pickedGroups]
  );
  const valid = emoji.trim().length > 0 && message.trim().length > 0 && (kind !== "selected" || people.length + pickedGroups.size > 0);

  async function handlePreview() {
    setCounting(true);
    try {
      const r = await callGift<{ willReceive: number; matched: number; skippedHavingUnopenedGift: number }>({
        method: "POST",
        body: { emoji, title, message, audience, replaceExisting, dryRun: true },
      });
      setPreview(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't count the audience.");
    } finally {
      setCounting(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      const r = await callGift<{ sentTo: number }>({ method: "POST", body: { emoji, title, message, audience, replaceExisting } });
      toast.success(`Sent to ${r.sentTo} ${r.sentTo === 1 ? "person" : "people"}.`);
      setPreview(null);
      callGift<{ gifts: HistoryRow[] }>({ method: "GET" }).then((h) => setHistory(h.gifts)).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the gift.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-10 border-t border-bg4 pt-6" data-testid="admin-popup-gift">
      <h3 className="mb-1 flex items-center gap-2 font-syne text-sm font-semibold text-text">
        <Gift className="h-4 w-4 text-gold" /> Popup gifts
      </h3>
      <p className="mb-4 font-noto text-xs text-muted">
        A surprise that pops up once (emoji, confetti, your message) the next time someone opens the app — like the ice cream. Send it to one person, a
        group, a segment, or everyone.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block font-syne text-xs font-semibold text-muted">Emoji</label>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} data-testid="gift-emoji" className="input-base w-24 text-center text-xl" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {EMOJI_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setEmoji(s)} className="rounded-md bg-bg3 px-1.5 py-0.5 text-lg hover:bg-bg4">
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block font-syne text-xs font-semibold text-muted">Title (optional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} data-testid="gift-title" className="input-base w-full" />
          </div>
          <div>
            <label className="mb-1 block font-syne text-xs font-semibold text-muted">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={240} rows={3} data-testid="gift-message" className="input-base w-full resize-none" />
          </div>

          <div>
            <label className="mb-1 block font-syne text-xs font-semibold text-muted">Send to</label>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setKind(a.value)}
                  data-testid={`gift-audience-${a.value}`}
                  className={`rounded-full border px-3 py-1.5 font-noto text-xs font-semibold ${
                    kind === a.value ? "border-clay bg-clay text-ivory" : "border-muted2 bg-bg3 text-muted hover:text-text"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {kind === "selected" && (
            <div className="flex flex-col gap-3 rounded-xl border border-bg4 bg-bg p-3">
              <div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people by name or @handle…" data-testid="gift-people-search" className="input-base w-full text-xs" />
                {results.length > 0 && (
                  <ul className="mt-1 overflow-hidden rounded-lg border border-bg4">
                    {results.map((u) => (
                      <li key={u.uid}>
                        <button
                          type="button"
                          onClick={() => {
                            setPeople((p) => [...p, u]);
                            setSearch("");
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-bg3"
                        >
                          <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={22} />
                          <span className="truncate font-noto text-xs text-text">{u.displayName}</span>
                          {u.handle && <span className="font-noto text-[11px] text-muted">@{u.handle}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {people.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="gift-people">
                    {people.map((p) => (
                      <span key={p.uid} className="flex items-center gap-1 rounded-full bg-bg3 py-0.5 pl-2 pr-1 font-noto text-xs text-text">
                        {p.displayName}
                        <button type="button" onClick={() => setPeople((x) => x.filter((y) => y.uid !== p.uid))} aria-label={`Remove ${p.displayName}`} className="text-muted hover:text-text">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1 font-syne text-xs font-semibold text-muted">
                  <Users className="h-3.5 w-3.5" /> Every member of these groups
                </p>
                <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto" data-testid="gift-groups">
                  {groups.length === 0 ? (
                    <p className="font-noto text-xs text-muted">No group chats found.</p>
                  ) : (
                    groups.map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-bg3">
                        <input
                          type="checkbox"
                          checked={pickedGroups.has(g.id)}
                          onChange={() =>
                            setPickedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id);
                              else next.add(g.id);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate font-noto text-xs text-text">{g.name}</span>
                        <span className="font-noto text-[11px] text-muted">{g.members}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 font-noto text-xs text-muted">
            <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
            Also replace a gift someone hasn&apos;t opened yet
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-bg4 bg-bg2 p-6 text-center" data-testid="gift-preview">
            <p className="mb-2 font-noto text-[10px] uppercase tracking-wide text-muted">Preview</p>
            <div className="text-6xl">{emoji || "🎁"}</div>
            <p className="mt-2 font-cinzel text-xl text-gold">{title.trim() || "You got a gift!"}</p>
            <p className="mt-1 font-noto text-base text-text">{message || "…"}</p>
          </div>

          {preview ? (
            <div className="rounded-xl border border-gold/40 bg-gold/5 p-3" data-testid="gift-confirm">
              <p className="font-noto text-sm text-text">
                This will pop up for <strong data-testid="gift-count">{preview.willReceive}</strong> {preview.willReceive === 1 ? "person" : "people"}.
              </p>
              {preview.skippedHavingUnopenedGift > 0 && (
                <p className="mt-0.5 font-noto text-xs text-muted">{preview.skippedHavingUnopenedGift} skipped — they already have an unopened gift.</p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={handleSend} disabled={sending || preview.willReceive === 0} data-testid="gift-send" className="btn-primary flex-1 justify-center disabled:opacity-40">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Send to ${preview.willReceive}`}
                </button>
                <button type="button" onClick={() => setPreview(null)} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={handlePreview} disabled={!valid || counting} data-testid="gift-preview-audience" className="btn-primary justify-center disabled:opacity-40">
              {counting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review audience & send"}
            </button>
          )}
        </div>
      </div>

      {history && history.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Recently sent</p>
          <ul className="flex flex-col gap-1.5" data-testid="gift-history">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-lg border border-bg4 bg-bg2 px-3 py-2">
                <span className="text-2xl">{h.gift.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-noto text-xs text-text">{h.gift.title ? `${h.gift.title} — ` : ""}{h.gift.message}</p>
                  <p className="font-noto text-[11px] text-muted">
                    {h.audience.kind === "selected" ? `${h.audience.userCount ?? 0} people, ${h.audience.groupCount ?? 0} groups` : h.audience.kind} · {h.sentTo} reached · {h.sentByName} · {formatTime(h.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
