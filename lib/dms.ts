import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
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
import { createNotification } from "./notifications";
import { NotificationType, type Conversation, type DMMessage, type MessageReplyTo } from "@/types";

/** A group @mention's token is the member's display name with whitespace stripped, lowercased —
 * there's no real @handle stored per-conversation-participant (only participantNames), so this
 * is the practical stand-in: what the mention dropdown inserts, and what sendDM scans new group
 * message text for to decide who gets notified. */
function mentionToken(displayName: string): string {
  return displayName.replace(/\s+/g, "").toLowerCase();
}

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
  text: string,
  replyTo?: MessageReplyTo
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const convoRef = doc(db, CONVERSATIONS, conversationId);
    const convoSnap = await getDoc(convoRef);
    if (!convoSnap.exists()) throw new Error("Conversation not found.");
    const convo = convoSnap.data() as Conversation;
    // Every OTHER participant is a "recipient" here — a 1:1 has exactly one, a group has
    // however many members besides the sender. Bumping only the first one (the original,
    // 1:1-only implementation) silently left every other group member's unread count frozen.
    const recipientIds = convo.participants.filter((id) => id !== senderId);

    await addDoc(collection(convoRef, "messages"), {
      conversationId,
      senderId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      ...(replyTo ? { replyTo } : {}),
    });

    const unreadUpdates = Object.fromEntries(
      recipientIds.map((id) => [`unreadCounts.${id}`, (convo.unreadCounts?.[id] ?? 0) + 1])
    );
    await updateDoc(convoRef, {
      lastMessage: trimmed,
      lastMessageAt: new Date().toISOString(),
      lastSenderId: senderId,
      ...unreadUpdates,
    });
    await updateLastActive(senderId);

    // Group @mentions — best-effort, never let a notification failure fail the send itself.
    if (convo.type === "group") {
      const senderName = convo.participantNames?.[senderId] ?? "Someone";
      for (const uid of recipientIds) {
        const name = convo.participantNames?.[uid];
        if (!name) continue;
        const token = mentionToken(name);
        if (!token || !trimmed.toLowerCase().includes(`@${token}`)) continue;
        createNotification(
          uid,
          NotificationType.GROUP_MENTION,
          `${senderName} mentioned you`,
          `in ${convo.name ?? "a group"}: ${trimmed.slice(0, 100)}`,
          "/messages",
          convo.participantPhotos?.[senderId]
        ).catch(() => {});
      }
    }
  } catch (error) {
    await logError(error, { operation: "sendDM", conversationId, senderId });
    throw error;
  }
}

/** Creates a new group conversation, admin'd by its creator, and returns its id. Unlike
 * startConversation's deterministic 1:1 id, a group gets a fresh auto-id every time — creating
 * "the same" group twice is a deliberate, valid action (two separate groups), not a duplicate
 * to be collapsed. */
export async function createGroup(
  creatorUid: string,
  name: string,
  photoURL: string | undefined,
  memberUids: string[]
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Give the group a name.");
  try {
    const participants = Array.from(new Set([creatorUid, ...memberUids]));
    const profiles = await Promise.all(participants.map((uid) => getUserProfile(uid)));
    const participantNames: Record<string, string> = {};
    const participantPhotos: Record<string, string> = {};
    const unreadCounts: Record<string, number> = {};
    participants.forEach((uid, i) => {
      participantNames[uid] = profiles[i]?.displayName ?? "Reader";
      participantPhotos[uid] = profiles[i]?.photoURL ?? "";
      unreadCounts[uid] = 0;
    });

    const ref = await addDoc(collection(db, CONVERSATIONS), {
      type: "group",
      name: trimmedName,
      ...(photoURL ? { photoURL } : {}),
      participants,
      participantNames,
      participantPhotos,
      adminUids: [creatorUid],
      creatorUid,
      lastMessage: "",
      lastMessageAt: new Date().toISOString(),
      lastSenderId: "",
      unreadCounts,
      createdAt: new Date().toISOString(),
    } satisfies Omit<Conversation, "id">);

    const creatorName = participantNames[creatorUid];
    memberUids
      .filter((uid) => uid !== creatorUid)
      .forEach((uid) => {
        createNotification(
          uid,
          NotificationType.GROUP_ADDED,
          "Added to a group",
          `${creatorName} added you to "${trimmedName}".`,
          "/messages",
          photoURL
        ).catch(() => {});
      });

    return ref.id;
  } catch (error) {
    await logError(error, { operation: "createGroup", creatorUid });
    throw error;
  }
}

export async function addMembersToGroup(
  conversationId: string,
  adminUid: string,
  newMemberUids: string[]
): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can add members.");

    const toAdd = newMemberUids.filter((uid) => !convo.participants.includes(uid));
    if (toAdd.length === 0) return;
    const profiles = await Promise.all(toAdd.map((uid) => getUserProfile(uid)));
    const nameUpdates: Record<string, string> = {};
    const photoUpdates: Record<string, string> = {};
    const unreadUpdates: Record<string, number> = {};
    toAdd.forEach((uid, i) => {
      nameUpdates[`participantNames.${uid}`] = profiles[i]?.displayName ?? "Reader";
      photoUpdates[`participantPhotos.${uid}`] = profiles[i]?.photoURL ?? "";
      unreadUpdates[`unreadCounts.${uid}`] = 0;
    });

    await updateDoc(ref, {
      participants: arrayUnion(...toAdd),
      ...nameUpdates,
      ...photoUpdates,
      ...unreadUpdates,
    });

    const adminName = convo.participantNames?.[adminUid] ?? "Someone";
    toAdd.forEach((uid) => {
      createNotification(
        uid,
        NotificationType.GROUP_ADDED,
        "Added to a group",
        `${adminName} added you to "${convo.name ?? "a group"}".`,
        "/messages",
        convo.photoURL
      ).catch(() => {});
    });
  } catch (error) {
    await logError(error, { operation: "addMembersToGroup", conversationId, adminUid });
    throw error;
  }
}

export async function removeMemberFromGroup(
  conversationId: string,
  adminUid: string,
  memberUid: string
): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can remove members.");
    if (memberUid === convo.creatorUid) throw new Error("The group creator can't be removed.");

    await updateDoc(ref, {
      participants: (convo.participants ?? []).filter((uid) => uid !== memberUid),
      adminUids: (convo.adminUids ?? []).filter((uid) => uid !== memberUid),
    });
  } catch (error) {
    await logError(error, { operation: "removeMemberFromGroup", conversationId, adminUid, memberUid });
    throw error;
  }
}

export async function makeGroupAdmin(conversationId: string, adminUid: string, targetUid: string): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can promote members.");
    if (!convo.participants.includes(targetUid)) throw new Error("That person isn't in this group.");
    await updateDoc(ref, { adminUids: arrayUnion(targetUid) });
  } catch (error) {
    await logError(error, { operation: "makeGroupAdmin", conversationId, adminUid, targetUid });
    throw error;
  }
}

export async function updateGroupInfo(
  conversationId: string,
  adminUid: string,
  info: { name?: string; description?: string; photoURL?: string }
): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can edit group info.");

    const updates: Record<string, string> = {};
    if (info.name?.trim()) updates.name = info.name.trim();
    if (info.description !== undefined) updates.description = info.description;
    if (info.photoURL !== undefined) updates.photoURL = info.photoURL;
    if (Object.keys(updates).length === 0) return;
    await updateDoc(ref, updates);
  } catch (error) {
    await logError(error, { operation: "updateGroupInfo", conversationId, adminUid });
    throw error;
  }
}

/** A non-admin (or an admin who isn't the creator) leaves a group of their own accord. */
export async function leaveGroup(conversationId: string, uid: string): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const convo = snap.data() as Conversation;
    await updateDoc(ref, {
      participants: (convo.participants ?? []).filter((id) => id !== uid),
      adminUids: (convo.adminUids ?? []).filter((id) => id !== uid),
    });
  } catch (error) {
    await logError(error, { operation: "leaveGroup", conversationId, uid });
    throw error;
  }
}

/** The group's creator only — deletes the conversation doc outright. Its messages subcollection
 * is left orphaned rather than recursively deleted (no batched-delete-of-a-subcollection helper
 * exists in the client SDK without paging through every doc; harmless since nothing can read an
 * orphaned subcollection once its parent conversation doc — and the access check that reads
 * it — no longer exists). */
export async function deleteGroup(conversationId: string, creatorUid: string): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const convo = snap.data() as Conversation;
    if (convo.creatorUid !== creatorUid) throw new Error("Only the group creator can delete it.");
    await deleteDoc(ref);
  } catch (error) {
    await logError(error, { operation: "deleteGroup", conversationId, creatorUid });
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

function messageRef(conversationId: string, messageId: string) {
  return doc(db, CONVERSATIONS, conversationId, "messages", messageId);
}

/** Edits a message's own text — the sender only (enforced in firestore.rules, not just here). */
export async function editMessage(
  conversationId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const trimmed = newContent.trim();
  if (!trimmed) return;
  try {
    await updateDoc(messageRef(conversationId, messageId), {
      text: trimmed,
      isEdited: true,
      editedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "editMessage", conversationId, messageId });
    throw error;
  }
}

/** "Delete for me" (uid-scoped, adds to `deletedFor` — anyone in the conversation may do this to
 * their own view) vs "delete for everyone" (sender only, enforced in firestore.rules — replaces
 * the content so deletedFor readers, if any, and everyone else both see the same placeholder). */
export async function deleteMessage(
  conversationId: string,
  messageId: string,
  uid: string,
  deleteForEveryone: boolean
): Promise<void> {
  try {
    if (deleteForEveryone) {
      await updateDoc(messageRef(conversationId, messageId), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        text: "This message was deleted",
      });
    } else {
      await updateDoc(messageRef(conversationId, messageId), { deletedFor: arrayUnion(uid) });
    }
  } catch (error) {
    await logError(error, { operation: "deleteMessage", conversationId, messageId, deleteForEveryone });
    throw error;
  }
}

/** Adds `uid` to the given emoji's reactor list, creating that reaction entry if it's the first
 * one — reactions are a plain array (not a map), so this reads-then-writes the whole field
 * rather than a single arrayUnion, same tradeoff CommentSection.tsx's like-toggle already makes. */
export async function addReaction(conversationId: string, messageId: string, uid: string, emoji: string): Promise<void> {
  try {
    const ref = messageRef(conversationId, messageId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const reactions = ((snap.data() as DMMessage).reactions ?? []).map((r) => ({ ...r, uids: [...r.uids] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (!existing.uids.includes(uid)) existing.uids.push(uid);
    } else {
      reactions.push({ emoji, uids: [uid] });
    }
    await updateDoc(ref, { reactions });
  } catch (error) {
    await logError(error, { operation: "addReaction", conversationId, messageId, emoji });
    throw error;
  }
}

export async function removeReaction(conversationId: string, messageId: string, uid: string, emoji: string): Promise<void> {
  try {
    const ref = messageRef(conversationId, messageId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const reactions = ((snap.data() as DMMessage).reactions ?? [])
      .map((r) => (r.emoji === emoji ? { ...r, uids: r.uids.filter((id) => id !== uid) } : r))
      .filter((r) => r.uids.length > 0);
    await updateDoc(ref, { reactions });
  } catch (error) {
    await logError(error, { operation: "removeReaction", conversationId, messageId, emoji });
    throw error;
  }
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
