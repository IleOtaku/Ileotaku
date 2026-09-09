"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Globe2, Loader2, Star } from "lucide-react";
import { toggleWorkFlags } from "@/lib/admin";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import type { CreatorWork } from "@/types";

export interface ApprovedWorkCardProps {
  work: CreatorWork;
  authorName: string;
  onUpdated: (workId: string, patch: Partial<CreatorWork>) => void;
}

/** An approved work — moderators can pin it as Featured or flag it as an African-original title. */
export default function ApprovedWorkCard({ work, authorName, onUpdated }: ApprovedWorkCardProps) {
  const [saving, setSaving] = useState<"featured" | "african" | null>(null);

  async function toggle(flag: "isFeatured" | "isAfricanOriginal", key: "featured" | "african") {
    setSaving(key);
    try {
      const next = !work[flag];
      await toggleWorkFlags(work.id, { [flag]: next });
      onUpdated(work.id, { [flag]: next });
    } catch {
      toast.error("Couldn't update this flag.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-4 sm:flex-row sm:items-center">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-bg3">
        {work.coverURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" src={getOptimizedImageUrl(work.coverURL, 200)} alt={work.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-xl text-muted">
            {work.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1">
        <h3 className="font-syne text-sm font-semibold text-text">{work.title}</h3>
        <p className="font-noto text-xs text-muted">by {authorName}</p>
        <p className="mt-1 font-noto text-[11px] text-muted">
          {work.views.toLocaleString()} views · ₦{work.earnings.toLocaleString()} earned
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => toggle("isFeatured", "featured")}
          disabled={saving !== null}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors disabled:opacity-50 ${
            work.isFeatured ? "border-gold bg-gold/15 text-gold" : "border-muted2 text-muted hover:text-text"
          }`}
        >
          {saving === "featured" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          Featured
        </button>
        <button
          type="button"
          onClick={() => toggle("isAfricanOriginal", "african")}
          disabled={saving !== null}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors disabled:opacity-50 ${
            work.isAfricanOriginal ? "border-green2 bg-green/15 text-green2" : "border-muted2 text-muted hover:text-text"
          }`}
        >
          {saving === "african" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
          African Original
        </button>
      </div>
    </div>
  );
}
