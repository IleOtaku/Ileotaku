"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import TipModal from "./TipModal";

export interface TipCreatorButtonProps {
  /** Real ÍléOtaku uid to credit, or null if this creator isn't a real account yet. */
  creatorId: string | null;
  creatorName: string;
  mangaId?: string;
  label?: string;
  className?: string;
}

/** Button that opens TipModal — shared by the manga detail page and public creator profiles. */
export default function TipCreatorButton({
  creatorId,
  creatorName,
  mangaId,
  label = "Tip Creator",
  className = "btn-gold",
}: TipCreatorButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Coins className="h-4 w-4" /> {label}
      </button>
      <TipModal
        open={open}
        onClose={() => setOpen(false)}
        creatorId={creatorId}
        creatorName={creatorName}
        mangaId={mangaId}
      />
    </>
  );
}
