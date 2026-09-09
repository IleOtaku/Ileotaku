import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateLastActive } from "./firestore";
import type { Conversation, DMMessage } from "@/types";

const CONVERSATIONS = "conversations";
const TYPING = "typing";
/** A "typing" flag older than this reads as not-typing — the safety net for a client that set
 * isTyping:true and never got to clear it (tab closed, crash) rather than "[Name] is typing..."
 * showing forever. The UI itself also debounces isTyping:false after 3s of no keystrokes; this
 * is the server-side backstop for when even that never runs. */
const TYPING_STALE_MS = 5000;

/** Deterministic id from the two participant uids, sorted — so re-starting a conversation
 * between the same two people always resolves to the same document instead of duplicating it. */
function conversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

/** Gets-or-creates the 1:1 conversation between two users and returns its id. */
export async function startConversation(uid1: string, uid2: string): Promise<string> {
  if (uid1 === uid2) throw new Error("You can't message yourself.");
  try {
    const id = conversationId(uid1, uid2);
    const ref = doc(db, CONVERSATIONS, id);
    const existing = await getDoc(ref);
    if (existing.exists()) return id;

    const [p1, p2] = await Promise.all([getUserProfile(uid1), getUserProfile(uid2)]);
    await setDoc(ref, {
      participants: [uid1, uid2],
      participantNames: {
        [uid1]: p1?.displayName ?? "Reader",
        [uid2]: p2?.displayName ?? "Reader",
      },
      participantPhotos: {
        [uid1]: p1?.photoURL ?? "",
        [uid2]: p2?.photoURL ?? "",
      },
      lastMessage: "",
      lastMessageAt: new Date().toISOString(),
      lastSenderId: "",
      unreadCounts: { [uid1]: 0, [uid2]: 0 },
      createdAt: new Date().toISOString(),
    } satisfies Omit<Conversation, "id">);
    return id;
  } catch (error) {
    await logError(error, { operation: "startConversation", uid1, uid2 });
    throw error;
  }
}

export async function sendDM(
  conversationId: string,
  senderId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const convoRef = doc(db, CONVERSATIONS, conversationId);
    const convoSnap = await getDoc(convoRef);
    if (!convoSnap.exists()) throw new Error("Conversation not found.");
    const convo = convoSnap.data() as Conversation;
    const recipientId = convo.participants.find((id) => id !== senderId) ?? senderId;

    await addDoc(collection(convoRef, "messages"), {
      conversationId,
      senderId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    });

    await updateDoc(convoRef, {
      lastMessage: trimmed,
      lastMessageAt: new Date().toISOString(),
      lastSenderId: senderId,
      [`unreadCounts.${recipientId}`]: (convo.unreadCounts?.[recipientId] ?? 0) + 1,
    });
    await updateLastActive(senderId);
  } catch (error) {
    await logError(error, { operation: "sendDM", conversationId, senderId });
    throw error;
  }
}

export function subscribeToConversation(
  conversationId: string,
  callback: (messages: DMMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, CONVERSATIONS, conversationId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DMMessage)),
    onError
  );
}

export async function getConversations(uid: string): Promise<Conversation[]> {
  const q = query(
    collection(db, CONVERSATIONS),
    where("participants", "array-contains", uid),
    orderBy("lastMessageAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation);
}

/** Real-time version of getConversations — the DM page's sidebar needs this rather than a
 * one-shot fetch so an incoming message bubbles that conversation to the top (and updates its
 * preview/unread badge) live, without the viewer having to refresh or reselect anything. */
export function subscribeToConversations(
  uid: string,
  callback: (conversations: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, CONVERSATIONS),
    where("participants", "array-contains", uid),
    orderBy("lastMessageAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation)),
    () => callback([])
  );
}

export async function markDMRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`unreadCounts.${uid}`]: 0 });
}

/** Real-time listener for a user's total unread DM count, for the Navbar badge. */
export function subscribeToUnreadDMCount(
  uid: string,
  callback: (count: number) => void
): Unsubscribe {
  const q = query(collection(db, CONVERSATIONS), where("participants", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => {
      const total = snap.docs.reduce((sum, d) => {
        const convo = d.data() as Conversation;
        return sum + (convo.unreadCounts?.[uid] ?? 0);
      }, 0);
      callback(total);
    },
    () => callback(0)
  );
}

/** Marks (or clears) `uid` as typing in `conversationId`. Writes only the caller's own key on
 * the shared `typing/{conversationId}` doc — firestore.rules enforces that at the write level
 * too, so no participant can ever spoof someone else's typing state. */
export async function setTyping(conversationId: string, uid: string, isTyping: boolean): Promise<void> {
  try {
    await setDoc(doc(db, TYPING, conversationId), { [uid]: isTyping ? serverTimestamp() : null }, { merge: true });
  } catch (error) {
    await logError(error, { operation: "setTyping", conversationId, uid });
  }
}

/** Real-time list of every uid currently (non-stale) typing in a conversation — callers filter
 * out their own uid before rendering, since a viewer never needs to see their own typing state
 * reflected back at them. */
export function subscribeToTyping(
  conversationId: string,
  callback: (typingUids: string[]) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, TYPING, conversationId),
    (snap) => {
      const data = snap.data() ?? {};
      const now = Date.now();
      const typingUids = Object.entries(data)
        .filter(([, value]) => {
          const ts = (value as { toMillis?: () => number } | null)?.toMillis?.();
          return ts !== undefined && now - ts < TYPING_STALE_MS;
        })
        .map(([uid]) => uid);
      callback(typingUids);
    },
    () => callback([])
  );
}
