import { Clapperboard } from "lucide-react";
import type { EditingApp } from "@/types";

const EDITING_APP_LABELS: Record<EditingApp, string> = {
  capcut: "CapCut",
  alightmotion: "Alight Motion",
  aftereffects: "After Effects",
  premiere: "Premiere Pro",
  other: "Other app",
};

export interface EditingAppBadgeProps {
  app: EditingApp | null | undefined;
}

/** Small "Edited with {app}" pill shown on a video FeedPostCard — renders nothing when the
 * creator didn't disclose an editing app (undefined, or explicitly null). */
export default function EditingAppBadge({ app }: EditingAppBadgeProps) {
  if (!app) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-bg2/80 px-2 py-0.5 font-noto text-[10px] font-semibold text-ivory backdrop-blur-sm">
      <Clapperboard className="h-3 w-3" /> Edited with {EDITING_APP_LABELS[app]}
    </span>
  );
}
