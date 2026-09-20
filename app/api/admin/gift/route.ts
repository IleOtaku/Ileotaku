import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { HttpError, adminDb, authenticate, handle } from "@/lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Super Admin popup gifts — the "ice cream" popup as a reusable tool. Sets `pendingGift` on the chosen users'
 * profiles; components/layout/GiftPopup.tsx shows it once (emoji + confetti + title + message) on their next load and
 * then clears it. Beta feedback: "Can the superadmin do that kind of announcement like the icecream one? so we can do
 * it time to time, set it to a specific user, or group of users, or everyone..."
 *
 * Runs on the server (admin SDK) so it can be limited to the SUPER admin — the client rules only know "isAdmin", which
 * a sub-admin also is, and one user's browser shouldn't be rewriting hundreds of other people's profiles anyway.
 */
type Audience =
  | { kind: "everyone" | "platinum" | "creators" | "publishers" }
  | { kind: "selected"; userIds?: string[]; groupIds?: string[] };

interface Body {
  emoji?: string;
  title?: string;
  message?: string;
  audience?: Audience;
  /** Also replace a gift the person hasn't opened yet (default: leave theirs alone). */
  replaceExisting?: boolean;
  /** Just count who it would reach. */
  dryRun?: boolean;
}

const MAX_SELECTED = 500;

async function resolveTargets(audience: Audience): Promise<{ uid: string; hasGift: boolean }[]> {
  const db = adminDb();
  const rows = new Map<string, { uid: string; hasGift: boolean }>();
  const add = (uid: string, data: Record<string, unknown>) => {
    if (data.isBanned === true) return;
    rows.set(uid, { uid, hasGift: !!data.pendingGift });
  };

  if (audience.kind === "selected") {
    const ids = new Set<string>((audience.userIds ?? []).filter((x) => typeof x === "string"));
    for (const gid of (audience.groupIds ?? []).slice(0, 50)) {
      const conv = await db.collection("conversations").doc(String(gid)).get();
      const c = conv.data();
      if (c && c.type === "group") (c.participants as string[]).forEach((u) => ids.add(u));
    }
    if (ids.size > MAX_SELECTED) throw new HttpError(400, `That's ${ids.size} people — pick at most ${MAX_SELECTED} (or use "Everyone").`);
    const refs = Array.from(ids).map((u) => db.collection("users").doc(u));
    for (let i = 0; i < refs.length; i += 100) {
      const snaps = await db.getAll(...refs.slice(i, i + 100));
      snaps.forEach((s) => s.exists && add(s.id, s.data() ?? {}));
    }
  } else {
    const col = db.collection("users");
    const q =
      audience.kind === "platinum" ? col.where("isPlatinum", "==", true)
      : audience.kind === "creators" ? col.where("isCreator", "==", true)
      : audience.kind === "publishers" ? col.where("isPublisher", "==", true)
      : col;
    (await q.get()).forEach((d) => add(d.id, d.data()));
  }
  return Array.from(rows.values());
}

export async function POST(request: Request) {
  return handle(async () => {
    const caller = await authenticate(request, "super");
    const body = (await request.json().catch(() => ({}))) as Body;

    const emoji = (body.emoji ?? "").trim();
    const title = (body.title ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!emoji || emoji.length > 16) throw new HttpError(400, "Pick an emoji (one or two characters).");
    if (!message || message.length > 240) throw new HttpError(400, "Write a message (up to 240 characters).");
    if (title.length > 60) throw new HttpError(400, "Keep the title under 60 characters.");
    const audience = body.audience;
    if (!audience || !["everyone", "platinum", "creators", "publishers", "selected"].includes(audience.kind)) {
      throw new HttpError(400, "Choose who should get it.");
    }
    if (audience.kind === "selected" && !(audience.userIds?.length || audience.groupIds?.length)) {
      throw new HttpError(400, "Pick at least one person or group.");
    }

    const all = await resolveTargets(audience);
    const targets = body.replaceExisting ? all : all.filter((t) => !t.hasGift);
    const summary = { matched: all.length, willReceive: targets.length, skippedHavingUnopenedGift: all.length - targets.length };
    if (body.dryRun) return NextResponse.json({ success: true, dryRun: true, ...summary });
    if (targets.length === 0) throw new HttpError(409, "Everyone in that audience already has an unopened gift.");

    const db = adminDb();
    const gift = { emoji, ...(title ? { title } : {}), message };
    for (let i = 0; i < targets.length; i += 400) {
      const batch = db.batch();
      targets.slice(i, i + 400).forEach((t) => batch.update(db.collection("users").doc(t.uid), { pendingGift: gift }));
      await batch.commit();
    }
    await db.collection("adminGifts").add({
      sentBy: caller.uid,
      sentByName: (caller.profile.displayName as string) ?? "",
      gift,
      audience: audience.kind === "selected" ? { kind: "selected", userCount: audience.userIds?.length ?? 0, groupCount: audience.groupIds?.length ?? 0 } : { kind: audience.kind },
      sentTo: targets.length,
      replacedExisting: !!body.replaceExisting,
      createdAt: new Date().toISOString(),
      serverTime: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, sentTo: targets.length, ...summary });
  });
}

/** GET -> the last 10 gifts sent, for the history list. */
export async function GET(request: Request) {
  return handle(async () => {
    await authenticate(request, "super");
    const snap = await adminDb().collection("adminGifts").orderBy("createdAt", "desc").limit(10).get();
    return NextResponse.json({
      success: true,
      gifts: snap.docs.map((d) => {
        const x = d.data();
        return { id: d.id, gift: x.gift, audience: x.audience, sentTo: x.sentTo, sentByName: x.sentByName, createdAt: x.createdAt };
      }),
    });
  });
}
