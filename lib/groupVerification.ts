import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { createNotification } from "./notifications";
import { NotificationType, type Conversation } from "@/types";

/**
 * Beta feedback: "Implement group verifications... group admins can apply for verification and admins can
 * grant them verification." A group's admin (not just anyone in it) applies with a short reason; a platform
 * admin reviews the queue in Admin → Verification and approves or rejects. Approval flips `verifiedGroup` on
 * the conversation, which puts a verified badge beside the group's name in the chat header, the group info
 * panel and the conversation list.
 *
 * One request document per group (`groupVerificationRequests/{conversationId}`); after a rejection the group's
 * admin can reapply, which reopens the same document.
 */
export type GroupVerificationStatus = "pending" | "approved" | "rejected";

export interface GroupVerificationRequest {
  conversationId: string;
  groupName: string;
  groupPhotoURL?: string;
  memberCount: number;
  requestedBy: string;
  requestedByName: string;
  reason: string;
  status: GroupVerificationStatus;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export const GROUP_VERIFICATION_MIN_REASON = 20;
const REQUESTS = "groupVerificationRequests";

export async function getGroupVerificationRequest(conversationId: string): Promise<GroupVerificationRequest | null> {
  try {
    const snap = await getDoc(doc(db, REQUESTS, conversationId));
    return snap.exists() ? (snap.data() as GroupVerificationRequest) : null;
  } catch (error) {
    await logError(error, { operation: "groupVerification.get", conversationId });
    return null;
  }
}

/** A group admin applies (or reapplies after a rejection). */
export async function applyForGroupVerification(
  conversation: Conversation,
  applicant: { uid: string; displayName: string },
  reason: string
): Promise<GroupVerificationRequest> {
  if (!(conversation.adminUids ?? []).includes(applicant.uid)) {
    throw new Error("Only a group admin can apply for verification.");
  }
  if (conversation.verifiedGroup) throw new Error("This group is already verified.");
  if (reason.trim().length < GROUP_VERIFICATION_MIN_REASON) {
    throw new Error(`Tell us a bit more — at least ${GROUP_VERIFICATION_MIN_REASON} characters.`);
  }
  const request: GroupVerificationRequest = {
    conversationId: conversation.id,
    groupName: conversation.name ?? "Group",
    ...(conversation.photoURL ? { groupPhotoURL: conversation.photoURL } : {}),
    memberCount: conversation.participants.length,
    requestedBy: applicant.uid,
    requestedByName: applicant.displayName,
    reason: reason.trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, REQUESTS, conversation.id), request);
    return request;
  } catch (error) {
    await logError(error, { operation: "groupVerification.apply", conversationId: conversation.id });
    throw error;
  }
}

export async function getAllGroupVerificationRequests(): Promise<GroupVerificationRequest[]> {
  const snap = await getDocs(query(collection(db, REQUESTS), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data() as GroupVerificationRequest);
}

/** Platform admin: grant the badge. */
export async function approveGroupVerification(request: GroupVerificationRequest, adminUid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "conversations", request.conversationId), { verifiedGroup: true });
    await updateDoc(doc(db, REQUESTS, request.conversationId), {
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminUid,
    });
    await createNotification(
      request.requestedBy,
      NotificationType.BADGE_APPROVED,
      "Your group is verified!",
      `🎉 "${request.groupName}" now has the verified badge.`,
      `/messages?open=${request.conversationId}`
    );
  } catch (error) {
    await logError(error, { operation: "groupVerification.approve", conversationId: request.conversationId, adminUid });
    throw error;
  }
}

export async function rejectGroupVerification(request: GroupVerificationRequest, adminUid: string, reason: string): Promise<void> {
  try {
    await updateDoc(doc(db, REQUESTS, request.conversationId), {
      status: "rejected",
      rejectionReason: reason.trim(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminUid,
    });
    await createNotification(
      request.requestedBy,
      NotificationType.MODERATION_ACTION,
      "Group verification reviewed",
      `"${request.groupName}" wasn't verified — ${reason.trim()}. A group admin can apply again.`,
      `/messages?open=${request.conversationId}`
    );
  } catch (error) {
    await logError(error, { operation: "groupVerification.reject", conversationId: request.conversationId, adminUid });
    throw error;
  }
}
