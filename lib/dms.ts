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
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
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
import { createNotification, sendPushToUser } from "./notifications";
import { NotificationType, type Conversation, type DMMediaType, type DMMessage, type MessageReplyTo } from "@/types";

/** DM overhaul: the conversation-list preview text for a media/share message with no caption
 * (a bare GIF, a shared manga, ...) — mirrors how every chat app shows "📷 Photo" etc. instead of
 * a blank last-message line. */
function mediaPreviewLabel(
  options: { mediaType?: DMMediaType; mediaUrls?: string[]; sharedMangaId?: string; sharedPostId?: string; viewSettings?: DMMessage["viewSettings"] } | undefined
): string {
  if (options?.sharedMangaId) return "📖 Shared a manga";
  if (options?.sharedPostId) return "📤 Shared a post";
  // View-once/expiry media never reveals what it is in the conversation list — just that it's
  // there and under what rule, same as the bubble's own locked-card treatment.
  if (options?.viewSettings) {
    const kind = options.mediaType === "voice" ? "Voice note" : options.mediaType === "video" ? "Video" : "Photo";
    return `👁 ${kind}`;
  }
  switch (options?.mediaType) {
    case "image":
      return options.mediaUrls && options.mediaUrls.length > 1 ? `📷 ${options.mediaUrls.length} photos` : "📷 Photo";
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
  /** Several images in one message (mediaUrl is the first). */
  mediaUrls?: string[];
  /** Voice notes: loudness bars drawn by the bubble. */
  mediaWaveform?: number[];
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
  /** View-once/timed/multi-view/daily — see ViewSettingsPicker and DMMessage's own doc comment.
   * Media/voice notes only; `viewCount` is always sent as 0 (nobody's opened it yet). */
  viewSettings?: DMMessage["viewSettings"];
  /** Set by ForwardMessageModal — see DMMessage.forwardedFrom's own doc comment. */
  forwardedFrom?: DMMessage["forwardedFrom"];
}

/**
 * Beta feedback: "Right now, anyone can message anyone... make it so, you can only send one
 * message to someone you've not chatted before... other messages won't send till that person
 * replies... and you can't call till that person replies." Applies only to a fresh 1:1
 * conversation where the CURRENT sender sent its very first message and the other side has never
 * sent anything back — a reply from either side, at any point, lifts this permanently (it never
 * re-applies once the two of them have actually talked). Never applies to groups, and never
 * restricts the recipient of an unsolicited first message from replying freely.
 */
export async function isAwaitingFirstReply(conversationId: string, senderId: string, recipientId: string): Promise<boolean> {
  const messages = collection(db, CONVERSATIONS, conversationId, "messages");
  const firstSnap = await getDocs(query(messages, orderBy("createdAt", "asc"), limit(1)));
  if (firstSnap.empty) return false; // nothing sent yet — this send would BE the opener
  if ((firstSnap.docs[0].data() as DMMessage).senderId !== senderId) return false; // they messaged first
  const recipientReplied = await getDocs(query(messages, where("senderId", "==", recipientId), limit(1)));
  return recipientReplied.empty;
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

    if (convo.type !== "group" && recipientIds.length === 1) {
      if (await isAwaitingFirstReply(conversationId, senderId, recipientIds[0])) {
        throw new Error("Wait for them to reply before sending another message.");
      }
    }

    // DM overhaul: disappearing messages — stamped at send-time from the conversation's current
    // setting, so toggling it later never retroactively changes an already-sent message's fate.
    const disappearing = convo.disappearingMessages;
    const expiresAt =
      disappearing?.enabled && disappearing.duration > 0
        ? new Date(Date.now() + disappearing.duration).toISOString()
        : undefined;

    const { replyTo, ...media } = options ?? {};
    const mediaFields = Object.fromEntries(Object.entries(media).filter(([, v]) => v !== undefined));
    const now = new Date().toISOString();

    await addDoc(collection(convoRef, "messages"), {
      conversationId,
      senderId,
      text: trimmed,
      createdAt: now,
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
      lastMessageAt: now,
      lastSenderId: senderId,
      // Read receipts: a fresh message is, by definition, unseen by anyone yet.
      lastMessageSeenBy: [],
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

    // Beta feedback: "I called a friend and she didn't know till she opened the app. It should push
    // notifications to devices like WhatsApp." A DM used to notify nobody unless the app was open.
    // Push-only (no bell entry, which would double up with the unread badge), and only when the
    // recipient was fully caught up: their FIRST unread message is what pings them, so a burst of
    // ten messages is one notification, not ten. A conversation they've muted stays silent.
    const senderLabel = convo.participantNames?.[senderId] ?? "New message";
    const pushTitle = convo.type === "group" ? `${senderLabel} · ${convo.name ?? "Group"}` : senderLabel;
    const pushBody = trimmed ? trimmed.slice(0, 120) : previewText;
    for (const uid of recipientIds) {
      if ((convo.unreadCounts?.[uid] ?? 0) > 0) continue;
      const mute = convo.mutedBy?.[uid];
      if (mute && (mute.until === "forever" || new Date(mute.until).getTime() > Date.now())) continue;
      sendPushToUser(uid, NotificationType.NEW_MESSAGE, pushTitle, pushBody, "/messages").catch(() => {});
    }

    // Group @mentions — best-effort, never let a notification failure fail the send itself.
    if (convo.type === "group") {
      const senderName = convo.participantNames?.[senderId] ?? "Someone";
      // Beta feedback: "add an @all to tag everyone in a gc" — a literal "@all" token (checked
      // as its own word boundary, `\B@all\b` would also match inside e.g. "email@all.com", so
      // this instead requires @all to not be glued to a preceding word character) notifies every
      // OTHER member exactly once, same as an individual @mention would.
      const mentionsAll = /(^|[^\w])@all\b/i.test(trimmed);
      for (const uid of recipientIds) {
        const name = convo.participantNames?.[uid];
        const token = name ? mentionToken(name) : "";
        const mentioned = mentionsAll || (token && trimmed.toLowerCase().includes(`@${token}`));
        if (!mentioned) continue;
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

/** Short, URL-safe invite code — collision risk is negligible at this app's scale (36^8 space)
 * and, unlike a UUID, it's short enough a member could plausibly read it aloud or type it. */
function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Beta feedback: "On join, it should show in grey faded text who joined and how (via link,
 * someone added)." A plain message doc with `senderId: "system"`/`isSystem: true` — rendered
 * centered/muted by MessagesClient instead of as a bubble. Best-effort: a missed system message
 * should never fail the join/add it's narrating. */
export async function addSystemMessage(conversationId: string, text: string): Promise<void> {
  try {
    await addDoc(collection(doc(db, CONVERSATIONS, conversationId), "messages"), {
      conversationId,
      senderId: "system",
      isSystem: true,
      text,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "addSystemMessage", conversationId });
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
      // Beta feedback: "Groups should have invite via link."
      inviteCode: generateInviteCode(),
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
      const memberName = nameUpdates[`participantNames.${uid}`];
      addSystemMessage(conversationId, `${adminName} added ${memberName}`).catch(() => {});
    });
  } catch (error) {
    await logError(error, { operation: "addMembersToGroup", conversationId, adminUid });
    throw error;
  }
}

/** Beta feedback: "Groups should have invite via link." Only a current admin may regenerate —
 * this invalidates every link already handed out (the old code simply matches nothing anymore),
 * so it doubles as the "revoke access" control WhatsApp/Telegram expose the same way. Returns
 * the fresh code so the caller can immediately render/copy the new link. */
export async function regenerateInviteCode(conversationId: string, adminUid: string): Promise<string> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can reset the invite link.");
    const code = generateInviteCode();
    await updateDoc(ref, { inviteCode: code });
    return code;
  } catch (error) {
    await logError(error, { operation: "regenerateInviteCode", conversationId, adminUid });
    throw error;
  }
}

export interface JoinViaInviteResult {
  success: boolean;
  conversationId?: string;
  groupName?: string;
  message?: string;
}

/** Beta feedback: "Groups should have invite via link." Looks a group up by its current
 * `inviteCode` and joins `uid` as a plain (non-admin) member — a reset/expired/typo'd code
 * simply matches nothing, same as any lookup-by-code flow. Already-a-member is treated as
 * success (not an error) so re-opening a link you already used just lands you back in the
 * group instead of showing a confusing failure. */
export async function joinGroupViaInvite(code: string, uid: string): Promise<JoinViaInviteResult> {
  const trimmed = code.trim();
  if (!trimmed) return { success: false, message: "That invite link looks incomplete." };
  try {
    // `type == "group"` is included as an explicit filter, not just implied, because
    // firestore.rules' read rule grants any signed-in user access to a conversation ONLY when
    // `resource.data.type == "group"` — Firestore can only prove a query satisfies a
    // resource-data-dependent rule when the query's own filters structurally guarantee it, so
    // without this second equality filter the query is rejected outright with "Missing or
    // insufficient permissions" before it ever runs, even though every real match already has
    // type "group" in practice. Confirmed live: exactly this failure on Isaac's own account.
    const q = query(
      collection(db, CONVERSATIONS),
      where("inviteCode", "==", trimmed),
      where("type", "==", "group"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { success: false, message: "This invite link is invalid or has expired." };
    }
    const convoDoc = snap.docs[0];
    const convo = convoDoc.data() as Conversation;
    if (convo.participants.includes(uid)) {
      return { success: true, conversationId: convoDoc.id, groupName: convo.name };
    }

    const profile = await getUserProfile(uid);
    const displayName = profile?.displayName ?? "Reader";
    await updateDoc(convoDoc.ref, {
      participants: arrayUnion(uid),
      [`participantNames.${uid}`]: displayName,
      [`participantPhotos.${uid}`]: profile?.photoURL ?? "",
      [`unreadCounts.${uid}`]: 0,
    });
    await addSystemMessage(convoDoc.id, `${displayName} joined via invite link`);

    return { success: true, conversationId: convoDoc.id, groupName: convo.name };
  } catch (error) {
    await logError(error, { operation: "joinGroupViaInvite", uid });
    return { success: false, message: "Couldn't join this group right now. Please try again." };
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
      ...(convo.memberTags?.[memberUid] ? { [`memberTags.${memberUid}`]: deleteField() } : {}),
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

/** Beta feedback: "group founder can't de-admin other admins." Only the FOUNDER (creatorUid) can take
 * admin rights away, and never from themselves — admins can promote, but demoting is the founder's call. */
export async function removeGroupAdmin(conversationId: string, founderUid: string, targetUid: string): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (convo.creatorUid !== founderUid) throw new Error("Only the group founder can remove an admin.");
    if (targetUid === convo.creatorUid) throw new Error("The founder can't be demoted.");
    if (!convo.adminUids?.includes(targetUid)) throw new Error("That person isn't an admin.");
    await updateDoc(ref, { adminUids: arrayRemove(targetUid) });
  } catch (error) {
    await logError(error, { operation: "removeGroupAdmin", conversationId, founderUid, targetUid });
    throw error;
  }
}

export const MEMBER_TAG_MAX_LENGTH = 20;

/** Sets (or, with an empty string, clears) a member's tag. Admins only. */
export async function setMemberTag(conversationId: string, adminUid: string, targetUid: string, tag: string): Promise<void> {
  try {
    const ref = doc(db, CONVERSATIONS, conversationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Group not found.");
    const convo = snap.data() as Conversation;
    if (!convo.adminUids?.includes(adminUid)) throw new Error("Only a group admin can set member tags.");
    if (!convo.participants.includes(targetUid)) throw new Error("That person isn't in this group.");
    const clean = tag.trim().replace(/\s+/g, " ").slice(0, MEMBER_TAG_MAX_LENGTH);
    await updateDoc(ref, { [`memberTags.${targetUid}`]: clean ? clean : deleteField() });
  } catch (error) {
    await logError(error, { operation: "setMemberTag", conversationId, adminUid, targetUid });
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
      ...(convo.memberTags?.[uid] ? { [`memberTags.${uid}`]: deleteField() } : {}),
    });
    // Beta feedback: "Add inline activity messages in dms (...aythex left)" — same grey
    // system-message convention as the join-via-invite/added-by-admin messages.
    const leaverName = convo.participantNames?.[uid] ?? "Someone";
    await addSystemMessage(conversationId, `${leaverName} left`);
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

/** WhatsApp-style Group Info redesign: "Media & Files" section. Fetches the most recent `cap`
 * messages (ordered by createdAt, no mediaType filter — an equality/`in` filter combined with an
 * orderBy on a different field needs a composite index; this avoids that entirely) and filters to
 * image/video ones client-side, capped to the newest 12 by default. A conversation's message
 * history isn't large enough for "scan the last few hundred" to be a real cost. */
export async function getConversationMedia(conversationId: string, take = 12): Promise<DMMessage[]> {
  try {
    const q = query(
      collection(db, CONVERSATIONS, conversationId, "messages"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const snap = await getDocs(q);
    const media = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as DMMessage)
      .filter((m) => m.mediaType === "image" || m.mediaType === "video");
    return media.slice(0, take);
  } catch (error) {
    await logError(error, { operation: "getConversationMedia", conversationId });
    return [];
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
      // A message someone chose to "Keep" (isKept) never expires, whatever its expiresAt says.
      const messages = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DMMessage)
        .filter((m) => m.isKept === true || !m.expiresAt || new Date(m.expiresAt).getTime() > now);
      callback(messages);
    },
    onError
  );
}

function messageRef(conversationId: string, messageId: string) {
  return doc(db, CONVERSATIONS, conversationId, "messages", messageId);
}

/** "Keep Message" — only offered in conversations with disappearing messages on. Adds `uid` to the
 * message's `keptBy` and marks it `isKept`, which exempts it from the disappearing timer for everyone (see
 * subscribeToConversation). Done in a transaction so two people keeping/unkeeping at once can't leave
 * `isKept` disagreeing with `keptBy`. */
export async function keepMessage(conversationId: string, messageId: string, uid: string): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const ref = messageRef(conversationId, messageId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Message not found.");
      const keptBy = new Set<string>((snap.data().keptBy as string[] | undefined) ?? []);
      keptBy.add(uid);
      tx.update(ref, { isKept: true, keptBy: Array.from(keptBy) });
    });
  } catch (error) {
    await logError(error, { operation: "keepMessage", conversationId, messageId });
    throw error;
  }
}

/** Removes `uid` from `keptBy`; the message only stops being kept (isKept false, so the disappearing timer
 * applies again) once NOBODY is keeping it any more. */
export async function unkeepMessage(conversationId: string, messageId: string, uid: string): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const ref = messageRef(conversationId, messageId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const remaining = ((snap.data().keptBy as string[] | undefined) ?? []).filter((id) => id !== uid);
      tx.update(ref, { keptBy: remaining, isKept: remaining.length > 0 });
    });
  } catch (error) {
    await logError(error, { operation: "unkeepMessage", conversationId, messageId });
    throw error;
  }
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
      // Beta feedback bug: "if the latest message was deleted, it should show the deleted
      // message text in the person's chat preview instead of still showing the deleted
      // message's contents." Deleting a message only ever touched the message doc itself —
      // conversations.lastMessage (the sidebar's own denormalized preview string) was never
      // told, so it kept showing the original text forever. Only worth the extra read when the
      // deleted message is actually the newest one in the thread; anything further back never
      // reached the preview in the first place.
      const latestSnap = await getDocs(
        query(collection(db, CONVERSATIONS, conversationId, "messages"), orderBy("createdAt", "desc"), limit(1))
      );
      if (latestSnap.docs[0]?.id === messageId) {
        await updateDoc(doc(db, CONVERSATIONS, conversationId), { lastMessage: "This message was deleted" });
      }
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

/* ============================== Read receipts (Platinum) ============================== */

/** A message only ever gets a `seenBy` write when its SENDER is Platinum — read receipts are that
 * sender's paid feature, not something a free recipient's own status affects. Within that, the
 * VIEWER's own "Send read receipts" toggle (Platinum-only setting; a free viewer has no such
 * choice and always sends) can still suppress the write. */
function shouldRecordSeen(message: Pick<DMMessage, "senderId" | "seenBy">, viewerUid: string, senderIsPlatinum: boolean, viewerSendsReceipts: boolean): boolean {
  if (message.senderId === viewerUid) return false;
  if (!senderIsPlatinum || !viewerSendsReceipts) return false;
  return !message.seenBy?.some((s) => s.uid === viewerUid);
}

export async function markMessageSeen(
  conversationId: string,
  messageId: string,
  viewerUid: string
): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId, "messages", messageId), {
    seenBy: arrayUnion({ uid: viewerUid, seenAt: new Date().toISOString() }),
  });
}

/**
 * Beta feedback: "Where's the platinum members read receipts feature?" Marks every message in
 * `messages` that `viewerUid` hasn't already seen, as seen — skipping anything the viewer sent
 * themselves, anything whose sender isn't Platinum (no receipt to send), and everything if the
 * viewer has their own read-receipt sending turned off. `isPlatinumSender` is a lookup rather than
 * a fetch per message — callers already have every sender's profile loaded (MessagesClient's own
 * senderProfiles map) for bubble styling, so this reuses that instead of re-querying Firestore.
 */
export async function markAllMessagesSeen(
  conversationId: string,
  viewerUid: string,
  messages: DMMessage[],
  isPlatinumSender: (senderId: string) => boolean,
  viewerSendsReceipts: boolean
): Promise<void> {
  const unseen = messages.filter((m) => shouldRecordSeen(m, viewerUid, isPlatinumSender(m.senderId), viewerSendsReceipts));
  if (unseen.length === 0) return;
  const batch = writeBatch(db);
  const seenAt = new Date().toISOString();
  unseen.forEach((m) => {
    batch.update(doc(db, CONVERSATIONS, conversationId, "messages", m.id), {
      seenBy: arrayUnion({ uid: viewerUid, seenAt }),
    });
  });
  // Conversation-list tick: `messages` is already the whole loaded thread in createdAt-ascending
  // order (subscribeToConversation), so its last entry is the same one lastMessageAt/lastSenderId
  // describe — if that happens to be one of the messages just marked seen, mirror it onto the
  // conversation doc too, so the sidebar row's tick can turn blue without loading this thread.
  const newest = messages[messages.length - 1];
  if (newest && unseen.some((m) => m.id === newest.id)) {
    batch.update(doc(db, CONVERSATIONS, conversationId), { lastMessageSeenBy: arrayUnion(viewerUid) });
  }
  await batch.commit();
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

/** Beta feedback bug: "The blur wallpaper toggle doesn't work." The toggle in WallpaperPicker
 * only ever updated its own local React state — the value never actually reached Firestore
 * unless the user ALSO picked a brand-new wallpaper in the same visit (setConversationWallpaper
 * bundles it in only as part of THAT write). Toggling blur on an already-set wallpaper did
 * nothing at all. This narrow, single-field update lets the toggle persist immediately on its
 * own, independent of picking a new color/gradient/image. */
export async function setConversationWallpaperBlur(conversationId: string, blur: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, CONVERSATIONS, conversationId), { wallpaperBlur: blur });
  } catch (error) {
    await logError(error, { operation: "setConversationWallpaperBlur", conversationId });
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
  key: "bubbleStyle" | "bubbleColor" | "universalBubble" | "sendReadReceipts",
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

/* ============================== View-once / custom-expiry media ============================== */

/**
 * Beta feedback: "WHERE'S THE VIEW ONCE INTEGRATION? FOR IMAGES, VIDEOS, TEXTS THAT WAS
 * REQUESTED!?" Whether `viewerUid` may currently see this message's content — a message with no
 * `viewSettings` is always viewable (every existing message keeps working unchanged). Every mode
 * is judged from server-written state only (viewCount, firstOpenedAt, viewedBy), never from a
 * local clock guess, since two different viewers' devices are never in perfect agreement about
 * "now".
 */
export function isMessageViewable(message: Pick<DMMessage, "viewSettings">, viewerUid: string): boolean {
  const settings = message.viewSettings;
  if (!settings) return true;
  const { mode, maxViews, viewCount, firstOpenedAt, deleteAfterMinutes, viewedBy } = settings;
  const viewerRecord = viewedBy?.find((v) => v.uid === viewerUid);

  switch (mode) {
    case "view_once":
      // Viewable only for whoever hasn't opened it yet — once ANYONE has (a group could have
      // several members), it's spent for everyone else too; see recordMessageView's isDeleted set.
      return !viewerRecord;

    case "timed": {
      // Not yet opened by anyone: the countdown hasn't started, so it's still there to open.
      if (!firstOpenedAt || !deleteAfterMinutes) return true;
      const expiryTime = new Date(firstOpenedAt).getTime() + deleteAfterMinutes * 60 * 1000;
      return Date.now() < expiryTime;
    }

    case "multi_view":
      // The rule is N views TOTAL across everyone, not N per person (a 1:1's "view once" already
      // covers the per-person case) — recordMessageView marks it deleted once this trips.
      return (viewCount ?? 0) < (maxViews ?? 1);

    case "daily":
      // Viewable once per calendar day per viewer — today's first open is always allowed;
      // anything after that same viewer's most recent open, same day, is not.
      if (!viewerRecord) return true;
      return new Date(viewerRecord.viewedAt).toDateString() !== new Date().toDateString();

    default:
      return true;
  }
}

/**
 * Records `viewerUid` opening a view-controlled message, and — for view_once/multi_view — marks
 * it expired for everyone the instant that trips. Callers must check isMessageViewable() BEFORE
 * calling this (it doesn't re-check), since opening the media is what "spends" a view.
 */
export async function recordMessageView(
  conversationId: string,
  messageId: string,
  viewerUid: string,
  message: Pick<DMMessage, "viewSettings">
): Promise<void> {
  const settings = message.viewSettings;
  if (!settings) return;
  const ref = doc(db, CONVERSATIONS, conversationId, "messages", messageId);
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    "viewSettings.viewCount": increment(1),
    "viewSettings.viewedBy": arrayUnion({ uid: viewerUid, viewedAt: now }),
  };
  if (!settings.firstOpenedAt) {
    updates["viewSettings.firstOpenedAt"] = now;
    if (settings.mode === "timed" && settings.deleteAfterMinutes) {
      updates["viewSettings.expiresAt"] = new Date(Date.now() + settings.deleteAfterMinutes * 60 * 1000).toISOString();
    }
  }
  await updateDoc(ref, updates);

  const newTotalViews = (settings.viewCount ?? 0) + 1;
  if (settings.mode === "view_once" || (settings.mode === "multi_view" && newTotalViews >= (settings.maxViews ?? 1))) {
    await updateDoc(ref, { isDeleted: true, deletedAt: now, text: "This message has expired" });
  }
}
