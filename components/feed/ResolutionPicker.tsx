"use client";

import { Crown, Lock } from "lucide-react";
import { IMAGE_RESOLUTION_COSTS, VIDEO_RESOLUTION_COSTS } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";

type ImageRes = NonNullable<CreatorPost["imageResolution"]>;
type VideoRes = NonNullable<CreatorPost["videoResolution"]>;

const IMAGE_LABELS: Record<ImageRes, string> = {
  standard: "Standard",
  hd: "HD",
  "2k": "2K",
  "4k": "4K",
};

const VIDEO_LABELS: Record<VideoRes, string> = {
  "480p": "480p",
  "720p": "720p",
  "1080p": "1080p",
  "2k": "2K",
  "4k": "4K",
};

/** Discriminated on `kind` so a caller passing kind="image" is required to pass an
 * ImageRes-typed value/onChange (and likewise for "video") — the two resolution spaces share no
 * tiers, so mixing them up is a real bug this type is meant to catch at compile time. */
export type ResolutionPickerProps =
  | { kind: "image"; value: ImageRes | undefined; onChange: (value: ImageRes) => void; isPlatinum: boolean }
  | { kind: "video"; value: VideoRes | undefined; onChange: (value: VideoRes) => void; isPlatinum: boolean };

/** Resolution-tier picker shown in the composer's media row once a photo or video is attached —
 * the core UI for Sprint 9b's resolution-based coin monetization: each tier above the free base
 * shows its coin cost (or "Free" for Platinum members), and the composer charges that cost via
 * chargeForResolution() right before posting. */
export default function ResolutionPicker(props: ResolutionPickerProps) {
  const { kind, value, isPlatinum } = props;
  const costs = kind === "image" ? IMAGE_RESOLUTION_COSTS : VIDEO_RESOLUTION_COSTS;
  const labels = kind === "image" ? IMAGE_LABELS : VIDEO_LABELS;
  const tiers = Object.keys(costs) as (ImageRes | VideoRes)[];

  function handleChange(tier: ImageRes | VideoRes) {
    if (props.kind === "image") props.onChange(tier as ImageRes);
    else props.onChange(tier as VideoRes);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-noto text-xs font-semibold text-muted">Resolution</span>
      <div className="flex flex-wrap gap-1.5">
        {tiers.map((tier) => {
          const cost = (costs as Record<string, number>)[tier];
          const active = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => handleChange(tier)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                active
                  ? "border-clay bg-clay/15 text-clay2"
                  : "border-muted2 bg-bg3 text-muted hover:border-clay"
              }`}
            >
              {labels[tier as keyof typeof labels]}
              {cost > 0 &&
                (isPlatinum ? (
                  <span className="flex items-center gap-0.5 text-gold">
                    <Crown className="h-3 w-3" /> Free
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-gold">
                    <Lock className="h-3 w-3" /> {cost}🪙
                  </span>
                ))}
            </button>
          );
        })}
      </div>
      {!isPlatinum && (
        <p className="font-noto text-[11px] text-muted">
          Higher resolutions cost coins per post — Platinum members post at every resolution for free.
        </p>
      )}
    </div>
  );
}
