"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui";
import { sendDM, type SendDMOptions } from "@/lib/dms";
import type { Conversation, DMMessage } from "@/types";

export interface ForwardMessageModalProps {
  open: boolean;
  onClose: () => void;
  message: DMMessage | null;
  conversations: Conversation[];
  currentUid: string;
}

/** Carries over everything a forward should keep — the text/media/share payload — but never the
 * original's reply-quote, reactions, or edit history; a forwarded message starts fresh. */
function toForwardOptions(m: DMMessage): SendDMOptions {
  return {
    mediaType: m.mediaType,
    mediaUrl: m.mediaUrl,
    mediaUrls: m.mediaUrls,
    mediaWaveform: m.mediaWaveform,
    mediaDuration: m.mediaDuration,
    mediaFileName: m.mediaFileName,
    mediaSize: m.mediaSize,
    mediaWidth: m.mediaWidth,
    mediaHeight: m.mediaHeight,
    sharedMangaId: m.sharedMangaId,
    sharedMangaTitle: m.sharedMangaTitle,
    sharedMangaCoverURL: m.sharedMangaCoverURL,
    sharedPostId: m.sharedPostId,
    sharedPostAuthorName: m.sharedPostAuthorName,
    sharedPostPreviewText: m.sharedPostPreviewText,
    sharedPostMediaUrl: m.sharedPostMediaUrl,
  };
}

/** Beta feedback: "Add a message forward feature... then long press normal texts to see the
 * forward button." Picks a conversation to re-send this message's content into as a brand-new
 * message (from the CURRENT user, in that other thread) — not a reference back to the original. */
export default function ForwardMessageModal({ open, onClose, message, conversations, currentUid }: ForwardMessageModalProps) {
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      conversations
        .filter((c) => !c.archivedBy?.[currentUid])
        .map((c) => {
          const isGroup = c.type === "group";
          const other = c.participants.find((id) => id !== currentUid) ?? "";
          const name = isGroup ? c.name ?? "Group" : c.participantNames?.[other] ?? "Reader";
          const photo = isGroup ? c.photoURL : c.participantPhotos?.[other];
          return { id: c.id, name, photo };
        })
        .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
    [conversations, currentUid, search]
  );

  async function handleForward(targetConversationId: string) {
    if (!message || sendingTo) return;
    setSendingTo(targetConversationId);
    try {
      await sendDM(targetConversationId, currentUid, message.text, toForwardOptions(message));
      toast.success("Message forwarded.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't forward this message.");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Forward to">
      <div className="flex flex-col gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="input-base w-full text-sm"
        />
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center font-noto text-sm text-muted">No conversations found.</p>
          ) : (
            rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleForward(c.id)}
                disabled={!!sendingTo}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg3 disabled:opacity-50"
              >
                <Avatar uid={c.id} photoURL={c.photo} displayName={c.name} size={36} />
                <span className="min-w-0 flex-1 truncate font-noto text-sm font-semibold text-text">{c.name}</span>
                <Send className={`h-4 w-4 shrink-0 text-muted ${sendingTo === c.id ? "animate-pulse" : ""}`} />
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
