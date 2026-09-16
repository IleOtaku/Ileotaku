"use client";

import { Modal } from "@/components/ui";

export interface StickerPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sticker: string) => void;
}

/** DM Feature Overhaul (Part A): a curated set of "stickers" — this app has no sticker-asset
 * pipeline or CDN of its own to draw real illustrated packs from, so these render as oversized,
 * single-glyph messages (mediaType: "sticker" on the message, rendered full-size in the bubble
 * instead of chat-text-sized — see MessagesClient's own sticker rendering) rather than small
 * inline emoji. Tap to send immediately, same as a GIF. */
const STICKERS = [
  "😂", "😍", "🥹", "😭", "🔥", "💯", "🎉", "❤️",
  "👏", "🙌", "😎", "🤔", "😴", "🥳", "😱", "🤯",
  "👀", "💀", "🙏", "✨", "🫶", "😤", "🤝", "👋",
];

export default function StickerPicker({ open, onClose, onSelect }: StickerPickerProps) {
  return (
    <Modal open={open} onClose={onClose} title="Send a Sticker">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {STICKERS.map((sticker) => (
          <button
            key={sticker}
            type="button"
            onClick={() => {
              onSelect(sticker);
              onClose();
            }}
            className="flex aspect-square items-center justify-center rounded-xl bg-bg3 text-4xl transition-transform hover:scale-110"
          >
            {sticker}
          </button>
        ))}
      </div>
    </Modal>
  );
}
