"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Users, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { joinGroupViaInvite } from "@/lib/dms";

export interface InviteJoinClientProps {
  code: string;
}

type Status = "checking" | "joining" | "joined" | "error";

/** Beta feedback: "Groups should have invite via link." A visitor lands here from a shared
 * /invite/[code] link; once they're signed in, this joins them and hands off to the group's
 * thread. Someone not yet signed in sees a plain "sign in first" prompt instead — there's no
 * redirect-back-after-login mechanism anywhere else in the app to hook into here either, so this
 * matches that same posture rather than inventing one just for this flow. */
export default function InviteJoinClient({ code }: InviteJoinClientProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setStatus("error");
      setMessage("Sign in to join this group.");
      return;
    }
    setStatus("joining");
    joinGroupViaInvite(code, user.uid).then((result) => {
      if (result.success && result.conversationId) {
        setStatus("joined");
        setGroupName(result.groupName ?? null);
        setTimeout(() => router.replace(`/messages?open=${result.conversationId}`), 1200);
      } else {
        setStatus("error");
        setMessage(result.message ?? "Couldn't join this group.");
      }
    });
  }, [loading, user, code, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      {(status === "checking" || status === "joining") && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-clay" />
          <p className="font-noto text-sm text-muted">Joining group...</p>
        </>
      )}
      {status === "joined" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-green2" />
          <p className="font-syne text-lg font-semibold text-text">
            You&apos;re in{groupName ? ` — welcome to ${groupName}!` : "!"}
          </p>
          <p className="font-noto text-xs text-muted">Taking you to the group...</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-10 w-10 text-clay2" />
          <p className="font-syne text-lg font-semibold text-text">{message}</p>
          {user ? (
            <Link href="/messages" className="btn-primary">
              <Users className="h-4 w-4" /> Go to Messages
            </Link>
          ) : (
            <Link href="/login" className="btn-primary">
              Sign In
            </Link>
          )}
        </>
      )}
    </div>
  );
}
