"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { startConversation } from "@/lib/dms";

export interface MessageButtonProps {
  targetUid: string;
  label?: string;
}

/** Starts (or resumes) a DM conversation with a real ÍléOtaku account, then opens it. */
export default function MessageButton({ targetUid, label = "Message" }: MessageButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!user || user.uid === targetUid) {
    return null;
  }

  async function handleClick() {
    if (!user) return;
    setPending(true);
    try {
      await startConversation(user.uid, targetUid);
      router.push(`/messages?with=${targetUid}`);
    } catch {
      toast.error("Couldn't start that conversation.");
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending} className="btn-ghost">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
      {label}
    </button>
  );
}
