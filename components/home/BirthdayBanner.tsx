"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cake } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { checkTodaysBirthdays, notifyBirthdayIfNotAlready, type BirthdayUser } from "@/lib/birthday";
import { startConversation } from "@/lib/dms";

/**
 * Beta feedback: a birthday feature. Runs the (lazy, not cron — see lib/birthday.ts's own doc
 * comment) birthday check once per home-feed load: fires the notification fan-out for EVERY
 * account with a birthday today, app-wide (so delivery doesn't depend on the right person
 * happening to load the feed first), but only ever RENDERS a banner for birthday people the
 * current viewer actually follows — a feed full of strangers' birthdays would be noise, not a
 * feature.
 */
export default function BirthdayBanner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [followedBirthdays, setFollowedBirthdays] = useState<BirthdayUser[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    checkTodaysBirthdays().then((users) => {
      if (cancelled) return;
      users.forEach((u) => notifyBirthdayIfNotAlready(u).catch(() => {}));
      const following = new Set(profile?.following ?? []);
      setFollowedBirthdays(users.filter((u) => following.has(u.uid) && u.uid !== user.uid));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (followedBirthdays.length === 0) return null;

  async function handleMessage(uid: string) {
    if (!user || starting) return;
    setStarting(uid);
    try {
      const conversationId = await startConversation(user.uid, uid);
      router.push(`/messages?open=${conversationId}`);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-2">
      {followedBirthdays.map((u) => (
        <button
          key={u.uid}
          type="button"
          onClick={() => handleMessage(u.uid)}
          disabled={starting === u.uid}
          className="flex w-full items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/10 to-clay/10 p-4 text-left transition-colors hover:from-gold/15 hover:to-clay/15 disabled:opacity-60"
        >
          <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={40} />
          <p className="flex-1 font-noto text-sm text-text">
            <Cake className="mr-1.5 inline h-4 w-4 text-gold" />
            Today is <span className="font-semibold">{u.displayName}</span>&apos;s birthday! Send them a message
          </p>
          <span className="text-xl">🎂</span>
        </button>
      ))}
    </div>
  );
}
