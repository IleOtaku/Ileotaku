import type { Metadata } from "next";
import StickerStoreClient from "@/components/stickers/StickerStoreClient";

export const metadata: Metadata = {
  title: "Sticker Store",
};

export default function StickerStorePage() {
  return <StickerStoreClient />;
}
