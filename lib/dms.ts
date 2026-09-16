import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { getUserProfile, updateLastActive } from "./firestore";
import { createNotification } from "./notifications";
import { NotificationType, type Conversation, type DMMediaType, type DMMessage, type MessageReplyTo } from "@/types";

/** DM overhaul: the conversation-list preview text for a media/share message with no caption
 * (a bare GIF, a shared manga, ...) — mirrors how every chat app shows "📷 Photo" etc. instead of
 * a blank last-message line. */
function mediaPreviewLabel(options: { mediaType?: DMMediaType; sharedMangaId?: string; sharedPostId?: string } | undefined): string {
  if (options?.sharedMangaId) return "📖 Shared a manga";
  if (options?.sharedPostId) return "📤 Shared a post";
  switch (options?.mediaType) {
    case "image":
      return "📷 Photo";
    case "video":
      return "🎥 Video";
    case "voice":
      return "🎤 Voice message";
    case "file":
      return "📁 File";
    case "gif":
      return "GIF";
    case "sticker":
      return "🎭 Sticker";
    default:
      return "";
  }
}

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

/** DM overhaul: everything beyond plain text a message can carry — a media attachment (image/
 * video/voice/file/gif/sticker) or a rich share (manga/post), plus the existing reply-quote.
 * `text` may legitimately be empty for a pure media/share message (a GIF or sticker needs no
 * caption) — sendDM's own `if (!trimmed) return` guard below is bypassed whenever any of these
 * are present. */
export interface SendDMOptions {
  replyTo?: MessageReplyTo;
  mediaType?: DMMediaType;
  mediaUrl?: string;
  mediaDuration?: number;
  mediaFileName?: string;
  mediaSize?: number;
  mediaWidth?: number;
  mediaHeight?: number;
  sharedMangaId?: string;
  sharedMangaTitle?: string;
  sharedMangaCoverURL?: string;
  sharedPostId?: string;
  sharedPostAuthorName?: string;
  sharedPostPreviewText?: string;
  sharedPostMediaUrl?: string;
}

export async function sendDM(
  conversationId: string,
  senderId: string,
  text: string,
  options?: SendDMOptions
): Promise<void> {
  const trimmed = text.trim();
  const hasAttachment = !!(options?.mediaType || options?.sharedMangaId || options?.sharedPostId);
  if (!trimmed && !hasAttachment) return;

  try {
    const convoRef = doc(db, CONVERSATIONS, conversationId);
    const convoSnap = await getDoc(convoRef);
    if (!convoSnap.exists()) throw new Error("Conversation not found.");
    const convo = convoSnap.data() as Conversation;
    // Every OTHER participant is a "recipient" here — a 1:1 has exactly one, a group has
    // however many members besides the sender. Bumping only the first one (the original,
    // 1:1-only implementation) silently left every other group member's unread count frozen.
    const recipientIds = convo.participants.filter((id) => id !== senderId);

    // DM overhaul: disappearing messages — stamped at send-time from the conversation's current
    // setting, so toggling it later never retroactively changes an already-sent message's fate.
    const disappearing = convo.disappearingMessages;
    const expiresAt =
      disappearing?.enabled && disappearing.duration > 0
        ? new Date(Date.now() + disappearing.duration).toISOString()
        : undefined;

    const { replyTo, ...media } = options ?? {};
    const mediaFields = Object.fromEntries(Object.entries(media).filter(([, v]) => v !== undefined));

    await addDoc(collection(convoRef, "messages"), {
      conversationId,
      senderId,
      text: trimmed,
      createdAt: new Date().toISOString(),
      ...(replyTo ? { replyTo } : {}),
      ...mediaFields,
      ...(expiresAt ? { expiresAt } : {}),
    });

    const unreadUpdates = Object.fromEntries(
      recipientIds.map((id) => [`unreadCounts.${id}`, (convo.unreadCounts?.[id] ?? 0) + 1])
    );
    const previewText = trimmed || mediaPreviewLabel(options);
    await updateDoc(convoRef, {
      lastMessage: previewText,
      lastMessageAt: new Date().toISOString(),
      lastSenderId: senderId,
      ...unreadUpdates,
      // A fresh message means the conversation is active again for everyone — clears it back
      // into whoever had hidden it (see hideConversationForUser's own doc comment) rather than
      // leaving it hidden forever the first time either side messages again.
      ...(convo.hiddenFor && convo.hiddenFor.length > 0 ? { hiddenFor: [] } : {}),
      // DM overhaul: a new message un-archives the conversation for anyone who'd archived it —
      // same "activity brings it back" precedent as hiddenFor above (see the Archive feature's
      // own doc comments on archiveConversation/unarchiveConversation).
      ...(convo.archivedBy && Object.keys(convo.archivedBy).length > 0 ? { archivedBy: {} } : {}),
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
    (snap) => {
      const now = Date.now();
      // DM overhaul (Part H): "Client-side: check expiresAt on each message render, hide if
      // expired." A Cloud Function sweep to actually DELETE expired docs is Phase 2 (no cron
      // infrastructure exists on this project today — see BUGS_FIXED.md); for now this is the
      // full disappearing-messages experience from every viewer's perspective, since a message
      // with no one left able to see it is functionally gone even before it's physically deleted.
      const messages = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DMMessage)
        .filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);
      callback(messages);
    },
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
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Conversation)
    .filter((c) => !c.hiddenFor?.includes(uid));
}

/** Real-time version of getConversations — the DM page's sidebar needs this rather than a
 * one-shot fetch so an incoming message bubbles that conversation to the top (and updates its
 * preview/unread badge) live, without the viewer having to refresh or reselect anything.
 * Filters out anything `uid` has hidden (see hideConversationForUser) the same way
 * getConversations does. */
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
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Conversation)
          .filter((c) => !c.hiddenFor?.includes(uid))
      ),
    () => callback([])
  );
}

/** Beta feedback: "Allow us to delete people we no longer chat [with]." Hides a conversation from
 * only `uid`'s own list — never touches the other participant(s)' view of it, and never deletes
 * any messages. Reappears automatically (see sendDM's own hiddenFor-clearing) the next time
 * anyone sends a new message into it. */
export async function hideConversationForUser(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { hiddenFor: arrayUnion(uid) });
}

export async function markDMRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`unreadCounts.${uid}`]: 0 });
}

/** Beta feedback: "...and also a clear conversation button." Distinct from
 * hideConversationForUser above — this empties the thread's history for `uid` (via the same
 * per-user `deletedFor` mechanism deleteMessage's "delete for me" already uses on a single
 * message) rather than just hiding the conversation row itself; the other participant(s)' view,
 * and the messages themselves, are untouched. Batched at Firestore's 500-write cap, same pattern
 * as propagateProfileChange. */
export async function clearConversationForUser(conversationId: string, uid: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, CONVERSATIONS, conversationId, "messages"), limit(500))
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { deletedFor: arrayUnion(uid) }));
    await batch.commit();
  } catch (error) {
    await logError(error, { operation: "clearConversationForUser", conversationId, uid });
    throw error;
  }
}

/* ---------------------------- DM overhaul: wallpaper ---------------------------- */

export interface WallpaperInput {
  wallpaperUrl: string;
  wallpaperType: "color" | "gradient" | "image";
  wallpaperBlur: boolean;
  setBy: string;
}

/** DM Feature Overhaul (Part B): saves a wallpaper onto the conversation itself — every
 * participant's onSnapshot listener on this same doc picks it up in real time, which is what
 * makes it "everyone sees the same background" rather than a per-viewer preference. Enforced
 * Platinum-only server-side too (firestore.rules checks the caller's own isPlatinum), not just by
 * this function's own caller (WallpaperPicker.tsx) hiding the UI from free accounts. */
export async function setConversationWallpaper(conversationId: string, input: WallpaperInput): Promise<void> {
  try {
    await updateDoc(doc(db, CONVERSATIONS, conversationId), {
      wallpaperUrl: input.wallpaperUrl,
      wallpaperType: input.wallpaperType,
      wallpaperBlur: input.wallpaperBlur,
      wallpaperSetBy: input.setBy,
    });
  } catch (error) {
    await logError(error, { operation: "setConversationWallpaper", conversationId });
    throw error;
  }
}

export async function clearConversationWallpaper(conversationId: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), {
    wallpaperUrl: "",
    wallpaperType: "",
    wallpaperBlur: false,
    wallpaperSetBy: "",
  });
}

/** DM Feature Overhaul (Part B, "My Uploads"): appends a freshly-uploaded wallpaper image to the
 * caller's own users/{uid}.uploadedWallpapers list. */
export async function addUploadedWallpaper(uid: string, url: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { uploadedWallpapers: arrayUnion(url) });
}

export async function removeUploadedWallpaper(uid: string, url: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { uploadedWallpapers: arrayRemove(url) });
}

/* ---------------------------- DM overhaul: chat-specific bubble color ---------------------------- */

/** DM Feature Overhaul (Part D): a per-conversation override of `uid`'s own bubble color — takes
 * priority over their universal users/{uid}.dmPreferences.bubbleColor default for messages in
 * THIS conversation only. Platinum-gated the same way wallpaper is. */
export async function setConversationBubbleColor(conversationId: string, uid: string, color: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`participantColors.${uid}`]: color });
}

/** DM Feature Overhaul (Part C): the bubble-SHAPE equivalent of setConversationBubbleColor above
 * — see Conversation.participantBubbleStyles' own doc comment for why this exists alongside the
 * universal users/{uid}.dmPreferences.bubbleStyle default. */
export async function setConversationBubbleStyle(conversationId: string, uid: string, style: number): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`participantBubbleStyles.${uid}`]: style });
}

/** DM Feature Overhaul (Parts C/D/G): writes ONE field on the caller's own
 * users/{uid}.dmPreferences map at a time, via dot-notation — a plain `{ dmPreferences: {...} }`
 * updateDoc() would REPLACE the whole map and silently wipe out whichever of
 * bubbleStyle/bubbleColor/universalBubble isn't included in that particular write. */
export async function setUserDmPreference(
  uid: string,
  key: "bubbleStyle" | "bubbleColor" | "universalBubble",
  value: number | string | boolean
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { [`dmPreferences.${key}`]: value });
}

/* ---------------------------- DM overhaul: nicknames ---------------------------- */

/** DM Feature Overhaul (Part E): `viewerUid` sets a private nickname for `targetUid` (the other
 * 1:1 participant, or a specific group member), visible only to `viewerUid` themselves — see the
 * Conversation.nicknames doc comment for why this is nicknames[viewerUid][targetUid] rather than
 * a flat per-conversation map. Free for everyone, no Platinum gate (unlike wallpaper/bubble
 * styling). */
export async function setNickname(conversationId: string, viewerUid: string, targetUid: string, nickname: string): Promise<void> {
  const trimmed = nickname.trim().slice(0, 30);
  if (!trimmed) return;
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`nicknames.${viewerUid}.${targetUid}`]: trimmed });
}

export async function resetNickname(conversationId: string, viewerUid: string, targetUid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`nicknames.${viewerUid}.${targetUid}`]: deleteField() });
}

/* ---------------------------- DM overhaul: mute ---------------------------- */

export async function muteConversation(conversationId: string, uid: string, durationMs: number | null): Promise<void> {
  const until = durationMs === null ? "forever" : new Date(Date.now() + durationMs).toISOString();
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`mutedBy.${uid}`]: { until } });
}

export async function unmuteConversation(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`mutedBy.${uid}`]: deleteField() });
}

/* ---------------------------- DM overhaul: disappearing messages ---------------------------- */

export type DisappearingDuration = 3600000 | 86400000 | 604800000; // 1hr / 24hr / 7days, in ms

/** DM Feature Overhaul (Part H): toggles auto-delete for NEW messages sent from now on — sendDM
 * stamps `expiresAt` at send-time from whatever this is set to; turning it off (or changing the
 * duration) never touches already-sent messages, only what happens going forward. */
export async function setDisappearingMessages(
  conversationId: string,
  enabled: boolean,
  duration: DisappearingDuration
): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), {
    disappearingMessages: { enabled, duration },
  });
}

/* ---------------------------- DM overhaul: archive ---------------------------- */

/** DM Feature Overhaul (Part I): hides a conversation into the sidebar's collapsed "Archived"
 * section for `uid` only — see Conversation.archivedBy's own doc comment for why a new message
 * clears this the same way hiddenFor does. */
export async function archiveConversation(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`archivedBy.${uid}`]: true });
}

export async function unarchiveConversation(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`archivedBy.${uid}`]: deleteField() });
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
