"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Clock, Eye, X } from "lucide-react";
import type { DMMessage } from "@/types";

export type ViewSettingsChoice = DMMessage["viewSettings"];

export interface ViewSettingsPickerProps {
  open: boolean;
  onClose: () => void;
  /** `undefined` means "Standard — no expiry". */
  onSelect: (settings: ViewSettingsChoice) => void;
}

const TIMED_PRESETS = [
  { label: "5 minutes", minutes: 5 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
];
const MULTI_VIEW_PRESETS = [2, 3, 4, 5];

/** Pretty label for a chosen setting — the pill shown in MediaPreviewModal/VoicePreviewBar once
 * something's picked, and reused for the message bubble's own locked-card label before it's ever
 * opened (both need the exact same wording). */
export function viewSettingsLabel(settings: ViewSettingsChoice): string | null {
  if (!settings) return null;
  switch (settings.mode) {
    case "view_once":
      return "👁 Once";
    case "timed":
      return `⏱ ${settings.deleteAfterMinutes && settings.deleteAfterMinutes % 60 === 0 ? `${settings.deleteAfterMinutes / 60}h` : `${settings.deleteAfterMinutes}min`}`;
    case "multi_view":
      return `👁 ${settings.maxViews}×`;
    case "daily":
      return "📅 Daily";
    default:
      return null;
  }
}

/**
 * Beta feedback: "WHERE'S THE VIEW ONCE INTEGRATION?" A bottom sheet offering four expiry modes
 * beyond the WhatsApp-style single "view once": a custom timer, a total-view-count cap, or a
 * once-per-day repeat. Returns the chosen DMMessage.viewSettings shape directly (minus viewCount,
 * which sendDM's caller always sets to 0) — or undefined for "Standard".
 */
export default function ViewSettingsPicker({ open, onClose, onSelect }: ViewSettingsPickerProps) {
  const [screen, setScreen] = useState<"root" | "timed" | "multi">("root");
  const [customAmount, setCustomAmount] = useState("10");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [customViews, setCustomViews] = useState("6");

  if (!open || typeof document === "undefined") return null;

  function close() {
    setScreen("root");
    onClose();
  }

  function pick(settings: ViewSettingsChoice) {
    onSelect(settings);
    close();
  }

  function pickTimed(minutes: number) {
    pick({ mode: "timed", deleteAfterMinutes: minutes, viewCount: 0 });
  }

  function pickMultiView(maxViews: number) {
    pick({ mode: "multi_view", maxViews: Math.min(10, Math.max(1, maxViews)), viewCount: 0 });
  }

  function submitCustomTimed() {
    const n = Math.max(1, parseInt(customAmount, 10) || 1);
    const minutes = customUnit === "minutes" ? n : customUnit === "hours" ? n * 60 : n * 1440;
    pickTimed(minutes);
  }

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/70 sm:items-center" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass flex max-h-[80vh] w-full flex-col overflow-y-auto rounded-t-2xl sm:max-w-sm sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-bg2/95 p-4 backdrop-blur">
          <h2 className="font-cinzel text-base text-gold">
            {screen === "root" ? "View settings" : screen === "timed" ? "Custom timer" : "Custom view count"}
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {screen === "root" && (
          <div className="flex flex-col gap-1 p-3">
            <button
              type="button"
              onClick={() => pick(undefined)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text">—</span>
              <div>
                <p className="font-syne text-sm font-semibold text-text">Standard</p>
                <p className="font-noto text-xs text-muted">No expiry</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => pick({ mode: "view_once", viewCount: 0 })}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text">
                <Eye className="h-4 w-4" />
              </span>
              <div>
                <p className="font-syne text-sm font-semibold text-text">View once</p>
                <p className="font-noto text-xs text-muted">Disappears after first open</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScreen("timed")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <p className="font-syne text-sm font-semibold text-text">Timed</p>
                <p className="font-noto text-xs text-muted">Disappears X time after first open</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScreen("multi")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text">
                <Eye className="h-4 w-4" />
              </span>
              <div>
                <p className="font-syne text-sm font-semibold text-text">Multi-view</p>
                <p className="font-noto text-xs text-muted">Can be opened a few times, then disappears</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => pick({ mode: "daily", viewCount: 0 })}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text">
                <Calendar className="h-4 w-4" />
              </span>
              <div>
                <p className="font-syne text-sm font-semibold text-text">Daily</p>
                <p className="font-noto text-xs text-muted">Viewable once a day, stays until deleted</p>
              </div>
            </button>
          </div>
        )}

        {screen === "timed" && (
          <div className="flex flex-col gap-1 p-3">
            {TIMED_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                onClick={() => pickTimed(p.minutes)}
                className="rounded-xl px-3 py-3 text-left font-noto text-sm text-text hover:bg-white/5"
              >
                {p.label}
              </button>
            ))}
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 p-3">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="input-base w-20"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}
                className="input-base flex-1"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
              <button type="button" onClick={submitCustomTimed} className="btn-primary shrink-0 text-xs">
                Set
              </button>
            </div>
          </div>
        )}

        {screen === "multi" && (
          <div className="flex flex-col gap-1 p-3">
            {MULTI_VIEW_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pickMultiView(n)}
                className="rounded-xl px-3 py-3 text-left font-noto text-sm text-text hover:bg-white/5"
              >
                {n} times
              </button>
            ))}
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 p-3">
              <input
                type="number"
                min={1}
                max={10}
                value={customViews}
                onChange={(e) => setCustomViews(e.target.value)}
                className="input-base w-20"
              />
              <span className="flex-1 font-noto text-xs text-muted">times (1-10)</span>
              <button type="button" onClick={() => pickMultiView(parseInt(customViews, 10) || 1)} className="btn-primary shrink-0 text-xs">
                Set
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
