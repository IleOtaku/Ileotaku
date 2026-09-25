/**
 * Group voice calls — the Firestore side (who's invited, who joined, when it ends, the system
 * messages/notifications around it). The audio side (a LiveKit SFU room, speaking detection) lives
 * in lib/livekitGroupCall.ts; the two only meet in hooks/useGroupCall.ts.
 *
 * Every state change here is a transaction against `groupCalls/{callId}` rather than a blind
 * write built from whatever the client last saw: with up to six people joining, declining and
 * leaving at the same moment, "am I the last one out?" has to be decided against the document
 * as it is NOW — otherwise two people leaving together can each think the other is still there
 * and the call never ends (or ends twice and posts two "call ended" messages).
 */
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { addSystemMessage } from "./dms";
import { logError } from "./errorLogger";
import { createLiveKitRoom } from "./livekitGroupCall";
import { createNotification } from "./notifications";
import { NotificationType, type CallParticipant, type Conversation, type GroupCall } from "@/types";

const GROUP_CALLS = "groupCalls";

/** Audio runs through a LiveKit SFU room (lib/livekitGroupCall.ts), not a peer-to-peer mesh, so
 * this is a sanity ceiling rather than a real technical limit — LiveKit itself comfortably hosts
 * far more than this per room. */
export const GROUP_CALL_MAX = 500;
/** How long the initiator's phone rings before the call is given up as unanswered. */
export const GROUP_CALL_RING_MS = 45_000;
/** How often every joined client bumps `heartbeatAt`. */
export const GROUP_CALL_HEARTBEAT_MS = 30_000;
/** A call with no heartbeat for this long is treated as dead (everyone's tab crashed or lost
 * network without hanging up) rather than shown as "in progress" forever. */
const GROUP_CALL_STALE_MS = 90_000;

export interface CallUser {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export function groupCallRef(callId: string) {
  return doc(db, GROUP_CALLS, callId);
}

/** "3:24", or "1:02:03" past an hour. */
export function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function joinedCount(call: Pick<GroupCall, "participants">): number {
  return Object.values(call.participants).filter((p) => p.status === "joined").length;
}

/** True while a call is genuinely still going: not ended AND something is still heartbeating it. */
export function isGroupCallLive(call: GroupCall, now = Date.now()): boolean {
  if (call.status === "ended") return false;
  const last = Date.parse(call.heartbeatAt ?? call.startedAt);
  return Number.isFinite(last) && now - last < GROUP_CALL_STALE_MS;
}

/** Whether `uid` should get the full-screen ringing overlay for this call right now: they were
 * invited, haven't answered, and the call only just started. Someone who opens the app 20 minutes
 * into a call still sees the "Join" banner in the chat, but the phone doesn't ring. */
export function shouldRingFor(call: GroupCall, uid: string, now = Date.now()): boolean {
  if (!isGroupCallLive(call, now)) return false;
  if (call.participants[uid]?.status !== "invited") return false;
  return now - Date.parse(call.startedAt) < GROUP_CALL_RING_MS + 15_000;
}

function participantEntry(user: CallUser, status: CallParticipant["status"], now?: string): CallParticipant {
  return {
    uid: user.uid,
    displayName: user.displayName || "Member",
    // Firestore rejects `undefined` field values outright, so a missing photo is omitted, not null-ed.
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    status,
    ...(now && status === "joined" ? { joinedAt: now } : {}),
    isMuted: false,
  };
}

function conversationLabel(conversation: Pick<Conversation, "name">): string {
  return conversation.name?.trim() || "your group";
}

/** Creates the call (initiator already `joined`, everyone else `invited`), rings the invitees
 * (bell + push) and drops a line in the chat. `memberUids` lets a group bigger than six pick who to
 * ring; by default it's every other member. Throws — before writing anything — if that would put
 * more than {@link GROUP_CALL_MAX} people on the call. */
export async function startGroupCall(
  conversation: Conversation,
  initiator: CallUser,
  memberUids?: string[]
): Promise<string> {
  if (!conversation.participants.includes(initiator.uid)) throw new Error("You're not a member of this group.");
  const invitees = Array.from(new Set(memberUids ?? conversation.participants)).filter(
    (uid) => uid !== initiator.uid && conversation.participants.includes(uid)
  );
  if (invitees.length === 0) throw new Error("There's nobody else in this group to call.");
  if (invitees.length + 1 > GROUP_CALL_MAX) {
    throw new Error(`Group calls support up to ${GROUP_CALL_MAX} people — pick up to ${GROUP_CALL_MAX - 1} to invite.`);
  }

  const callId = crypto.randomUUID();
  const now = new Date().toISOString();
  const participants: Record<string, CallParticipant> = {
    [initiator.uid]: participantEntry(initiator, "joined", now),
  };
  for (const uid of invitees) {
    participants[uid] = participantEntry(
      {
        uid,
        displayName: conversation.participantNames?.[uid] ?? "Member",
        photoURL: conversation.participantPhotos?.[uid] || undefined,
      },
      "invited"
    );
  }

  const call: GroupCall = {
    callId,
    conversationId: conversation.id,
    ...(conversation.name ? { conversationName: conversation.name } : {}),
    initiatorUid: initiator.uid,
    status: "ringing",
    participants,
    participantUids: conversation.participants,
    maxParticipants: GROUP_CALL_MAX,
    startedAt: now,
    heartbeatAt: now,
  };
  await setDoc(groupCallRef(callId), call);
  createLiveKitRoom(callId, GROUP_CALL_MAX).catch(() => {});

  const label = conversationLabel(conversation);
  for (const uid of invitees) {
    createNotification(
      uid,
      NotificationType.INCOMING_CALL,
      `📞 ${initiator.displayName} started a group call`,
      `Join the call in ${label}.`,
      `/messages?open=${conversation.id}`
    ).catch(() => {});
  }
  await addSystemMessage(conversation.id, `📞 ${initiator.displayName} started a group call`);
  return callId;
}

/** Puts `user` on the call. Refuses an ended call or a full one. The second person to join flips
 * it from "ringing" to "active" and starts the duration clock. */
export async function joinGroupCall(callId: string, user: CallUser): Promise<GroupCall> {
  const ref = groupCallRef(callId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This call no longer exists.");
    const call = snap.data() as GroupCall;
    if (call.status === "ended") throw new Error("This call has already ended.");
    if (!call.participantUids.includes(user.uid)) throw new Error("You're not a member of this group.");

    const alreadyIn = call.participants[user.uid]?.status === "joined";
    const joined = joinedCount(call);
    if (!alreadyIn && joined >= call.maxParticipants) {
      throw new Error(`This call is full (${call.maxParticipants} people max).`);
    }

    const now = new Date().toISOString();
    const entry = participantEntry(user, "joined", now);
    const updates: Record<string, unknown> = { [`participants.${user.uid}`]: entry, heartbeatAt: now };
    const next: GroupCall = { ...call, participants: { ...call.participants, [user.uid]: entry }, heartbeatAt: now };
    if (joined + (alreadyIn ? 0 : 1) >= 2 && call.status === "ringing") {
      updates.status = "active";
      updates.activeAt = call.activeAt ?? now;
      next.status = "active";
      next.activeAt = call.activeAt ?? now;
    }
    tx.update(ref, updates);
    return next;
  });
}

export interface LeaveResult {
  /** True only for the ONE client whose transaction actually ended the call. */
  ended: boolean;
}

/** Takes `uid` off the call. If that leaves fewer than two people in it, the call is over: it's
 * marked ended (with its duration) and — from the single client whose transaction did that — a
 * "Group call ended · 3:24" line is posted, plus "missed" notifications for anyone who was invited
 * and never picked up. */
export async function leaveGroupCall(callId: string, uid: string): Promise<LeaveResult> {
  const ref = groupCallRef(callId);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const call = snap.data() as GroupCall;
    if (call.status === "ended" || !call.participants[uid]) return null;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`participants.${uid}.status`]: "left",
      [`participants.${uid}.leftAt`]: now,
    };
    const remaining = Object.values(call.participants).filter((p) => p.uid !== uid && p.status === "joined").length;
    const after: GroupCall = {
      ...call,
      participants: { ...call.participants, [uid]: { ...call.participants[uid], status: "left", leftAt: now } },
    };
    if (remaining <= 1) {
      const duration = call.activeAt ? Math.max(0, Math.round((Date.parse(now) - Date.parse(call.activeAt)) / 1000)) : 0;
      updates.status = "ended";
      updates.endedAt = now;
      updates.duration = duration;
      after.status = "ended";
      after.endedAt = now;
      after.duration = duration;
    }
    tx.update(ref, updates);
    return { ended: remaining <= 1, call: after };
  });
  if (!result) return { ended: false };
  if (result.ended) await announceEndedCall(result.call);
  return { ended: result.ended };
}

/** `user` turns the ringing call down. Posts "[Name] declined the call"; if that leaves nobody who
 * could still pick up (everyone invited has declined, and the caller is alone) the call ends. */
export async function declineGroupCall(callId: string, user: CallUser): Promise<void> {
  const ref = groupCallRef(callId);
  const declined = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const call = snap.data() as GroupCall;
    if (call.status === "ended" || call.participants[user.uid]?.status !== "invited") return null;

    const updates: Record<string, unknown> = { [`participants.${user.uid}.status`]: "declined" };
    const stillPossible = Object.values(call.participants).some(
      (p) => p.uid !== call.initiatorUid && p.uid !== user.uid && (p.status === "invited" || p.status === "joined")
    );
    if (!stillPossible) {
      updates.status = "ended";
      updates.endedAt = new Date().toISOString();
      updates.duration = 0;
    }
    tx.update(ref, updates);
    return call;
  });
  if (declined) await addSystemMessage(declined.conversationId, `${user.displayName || "Someone"} declined the call`);
}

/** Runs once per call, from whoever's transaction ended it. */
async function announceEndedCall(call: GroupCall): Promise<void> {
  try {
    const initiatorName = call.participants[call.initiatorUid]?.displayName ?? "Someone";
    const missed = Object.values(call.participants).filter((p) => p.status === "invited");
    const answered = !!call.activeAt;

    await addSystemMessage(
      call.conversationId,
      answered ? `Group call ended · ${formatCallDuration(call.duration ?? 0)}` : `Missed group call from ${initiatorName}`
    );
    if (answered && missed.length > 0) {
      await addSystemMessage(call.conversationId, `${missed.map((p) => p.displayName).join(", ")} missed the call`);
    }
    for (const p of missed) {
      createNotification(
        p.uid,
        NotificationType.MISSED_CALL,
        "You missed a group call",
        `${initiatorName} called ${call.conversationName?.trim() || "your group"}.`,
        `/messages?open=${call.conversationId}`
      ).catch(() => {});
    }
  } catch (error) {
    await logError(error, { operation: "announceEndedCall", callId: call.callId });
  }
}

/** Mute state is the one piece of per-participant call state other people need to SEE (a mic icon
 * on your tile), so it's the one thing besides join/leave that goes through Firestore. */
export async function setGroupCallMuted(callId: string, uid: string, isMuted: boolean): Promise<void> {
  await updateDoc(groupCallRef(callId), { [`participants.${uid}.isMuted`]: isMuted });
}

export async function heartbeatGroupCall(callId: string): Promise<void> {
  await updateDoc(groupCallRef(callId), { heartbeatAt: new Date().toISOString() });
}

export function subscribeToGroupCall(callId: string, onCall: (call: GroupCall | null) => void): Unsubscribe {
  return onSnapshot(
    groupCallRef(callId),
    (snap) => onCall(snap.exists() ? (snap.data() as GroupCall) : null),
    (error) => {
      console.error("[groupCalls] subscribeToGroupCall failed:", error);
      onCall(null);
    }
  );
}

/** Live calls (ringing/active, heartbeat still fresh) the user can see, newest first. `conversationId`
 * narrows it to one chat (the Join banner); omit it for the app-wide incoming-call listener. */
export function subscribeToLiveGroupCalls(
  uid: string,
  conversationId: string | null,
  onCalls: (calls: GroupCall[]) => void
): Unsubscribe {
  const constraints = [
    where("participantUids", "array-contains", uid),
    ...(conversationId ? [where("conversationId", "==", conversationId)] : []),
    where("status", "in", ["ringing", "active"]),
  ];
  return onSnapshot(
    query(collection(db, GROUP_CALLS), ...constraints),
    (snap) => {
      const calls = snap.docs.map((d) => d.data() as GroupCall);
      calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      onCalls(calls);
    },
    (error) => {
      console.error("[groupCalls] subscribeToLiveGroupCalls failed:", error);
      onCalls([]);
    }
  );
}

/** The last few finished calls in a conversation, for the group info panel. */
export async function getGroupCallHistory(conversationId: string, uid: string, count = 5): Promise<GroupCall[]> {
  const snap = await getDocs(
    query(
      collection(db, GROUP_CALLS),
      where("participantUids", "array-contains", uid),
      where("conversationId", "==", conversationId),
      where("status", "==", "ended"),
      orderBy("startedAt", "desc"),
      limit(count)
    )
  );
  return snap.docs.map((d) => d.data() as GroupCall);
}
