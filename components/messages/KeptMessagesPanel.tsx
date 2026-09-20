"use client";

import { Bookmark, File as FileIcon, Film, Image as ImageIcon, Mic } from "lucide-react";
import { Modal } from "@/components/ui";
import { formatExactTime } from "@/lib/utils";
import type { DMMessage } from "@/types";

/** One-line description of what a kept message holds (text, or a label for its media). */
function contentLabel(m: DMMessage) {
  if (m.text) return { icon: null, text: m.text };
  switch (m.mediaType) {
    case "image":
      return { icon: ImageIcon, text: m.mediaUrls && m.mediaUrls.length > 1 ? `${m.mediaUrls.length} photos` : "Photo" };
    case "video":
      return { icon: Film, text: "Video" };
    case "voice":
      return { icon: Mic, text: "Voice message" };
    case "file":
      return { icon: FileIcon, text: m.mediaFileName ?? "File" };
    default:
      return { icon: null, text: "Message" };
  }
}

/** "Kept Messages" for a disappearing-messages conversation: every message someone chose to keep, oldest
 * first, with who sent it, when it was originally sent, and an Unkeep button. You can only unkeep what YOU kept —
 * one somebody else kept shows who is holding it instead. */
export default function KeptMessagesPanel({
  open,
  onClose,
  messages,
  currentUid,
  nameFor,
  onUnkeep,
}: {
  open: boolean;
  onClose: () => void;
  messages: DMMessage[];
  currentUid: string;
  nameFor: (senderId: string) => string;
  onUnkeep: (m: DMMessage) => void;
}) {
  const kept = messages.filter((m) => m.isKept && !m.isDeleted).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  return (
    <Modal open={open} onClose={onClose} title="Kept Messages" widthClass="sm:max-w-lg" zIndex={130}>
      {kept.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Bookmark className="h-8 w-8 text-muted2" />
          <p className="font-noto text-sm text-muted">Nothing kept yet.</p>
          <p className="max-w-xs font-noto text-xs text-muted2">
            Long-press (or use the ⋯ menu on) a message and choose Keep Message — it will stay even after the disappearing timer runs out.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="kept-list">
          {kept.map((m) => {
            const { icon: Icon, text } = contentLabel(m);
            const mine = m.keptBy?.includes(currentUid) ?? false;
            const others = (m.keptBy ?? []).filter((id) => id !== currentUid);
            return (
              <li key={m.id} className="flex items-start gap-3 rounded-xl bg-bg3 p-3" data-testid="kept-item">
                <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-gold" fill="currentColor" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 break-words font-noto text-sm text-text">
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />}
                    <span className="line-clamp-3">{text}</span>
                  </p>
                  <p className="mt-1 font-noto text-[11px] text-muted">
                    {nameFor(m.senderId)} ·{" "}
                    {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, {formatExactTime(m.createdAt)}
                  </p>
                  {!mine && others.length > 0 && <p className="mt-0.5 font-noto text-[11px] text-muted2">Kept by {others.length === 1 ? nameFor(others[0]) : `${others.length} people`}</p>}
                </div>
                {mine && (
                  <button type="button" onClick={() => onUnkeep(m)} className="btn-ghost shrink-0 px-2.5 py-1 text-xs">
                    Unkeep
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
