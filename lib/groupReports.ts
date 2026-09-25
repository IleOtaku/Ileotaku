/**
 * Group chat reports and their moderation workflow. Distinct from the generic report system
 * (lib/firestore.ts's submitReport, ReportModal.tsx) because reviewing a group report needs a
 * snapshot of what was actually said (last15Messages) and a richer action set (temp-ban every
 * member, escalate to a Super Admin, perma-ban, delete the group) that a single-target content
 * report has no use for.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { permanentlyBanUser, suspendUserFor } from "./admin";
import { logError } from "./errorLogger";
import { getUserProfile } from "./firestore";
import { createNotification } from "./notifications";
import { NotificationType, type Conversation, type DMMessage, type GroupReport, type GroupReportReason, type ReportedMessageSnapshot } from "@/types";

const GROUP_REPORTS = "groupReports";
const CONVERSATIONS = "conversations";
/** Sub Admin's "Temp Ban Group Members" action. */
const TEMP_BAN_DAYS = 7;

async function lastMessages(
  conversationId: string,
  participantNames: Record<string, string> | undefined,
  take = 15
): Promise<ReportedMessageSnapshot[]> {
  const snap = await getDocs(
    query(collection(db, CONVERSATIONS, conversationId, "messages"), orderBy("createdAt", "desc"), limit(take))
  );
  return snap.docs
    .map((d) => d.data() as DMMessage)
    .reverse()
    .map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderId === "system" ? "System" : participantNames?.[m.senderId] ?? m.senderId,
      text: m.isDeleted ? "[deleted]" : m.text,
      createdAt: m.createdAt,
    }));
}

/** Beta feedback: "Add a gc report feature that... shows the last 15 messages sent on the group." */
export async function submitGroupReport(
  conversation: Pick<Conversation, "id" | "name" | "photoURL" | "participantNames">,
  reporter: { uid: string; displayName: string },
  reason: GroupReportReason,
  description: string
): Promise<void> {
  try {
    const messages = await lastMessages(conversation.id, conversation.participantNames);
    const ref = doc(collection(db, GROUP_REPORTS));
    await setDoc(ref, {
      id: ref.id,
      groupId: conversation.id,
      groupName: conversation.name?.trim() || "Untitled group",
      ...(conversation.photoURL ? { groupPhotoURL: conversation.photoURL } : {}),
      reportedBy: reporter.uid,
      reportedByName: reporter.displayName || "A member",
      reason,
      description: description.trim(),
      last15Messages: messages,
      status: "pending",
      createdAt: new Date().toISOString(),
    } satisfies GroupReport);
  } catch (error) {
    await logError(error, { operation: "submitGroupReport", conversationId: conversation.id });
    throw error;
  }
}

export function subscribeToGroupReports(onReports: (reports: GroupReport[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, GROUP_REPORTS), orderBy("createdAt", "desc")),
    (snap) => onReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GroupReport)),
    (error) => {
      console.error("[groupReports] subscribeToGroupReports failed:", error);
      onReports([]);
    }
  );
}

export async function dismissGroupReport(reportId: string, resolvedBy: string): Promise<void> {
  await updateDoc(doc(db, GROUP_REPORTS, reportId), {
    status: "resolved",
    resolution: "dismissed",
    resolvedBy,
    resolvedAt: new Date().toISOString(),
  });
}

/** Sub Admin action — forwards the report to every Super Admin, who see it in their own pending
 * approvals (the same AdminGroupReportsTab, filtered to "escalated"). */
export async function escalateGroupReport(reportId: string, escalatedBy: string, note: string): Promise<void> {
  await updateDoc(doc(db, GROUP_REPORTS, reportId), {
    status: "escalated",
    escalationNote: note.trim(),
    escalatedBy,
    escalatedAt: new Date().toISOString(),
  });
  const reportSnap = await getDoc(doc(db, GROUP_REPORTS, reportId));
  const report = reportSnap.data() as GroupReport | undefined;
  const superAdmins = await getDocs(query(collection(db, "users"), where("isAdmin", "==", true)));
  await Promise.all(
    superAdmins.docs
      .filter((d) => {
        const adminType = d.data().adminType as string | undefined;
        return adminType === undefined || adminType === "super";
      })
      .map((d) =>
        createNotification(
          d.id,
          NotificationType.GROUP_REPORT_ESCALATED,
          "Group report escalated",
          `A report on "${report?.groupName ?? "a group"}" was escalated for your review.`,
          "/admin"
        ).catch(() => {})
      )
  );
}

async function activeMemberUids(groupId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, CONVERSATIONS, groupId));
  const convo = snap.data() as Conversation | undefined;
  return convo?.participants ?? [];
}

/** Sub Admin action — bans every current member of the group for 7 days. Literal reading of the
 * spec ("bans all active members"): no exemption for the reporter or the group's own admins. */
export async function tempBanGroupMembers(reportId: string, groupId: string, actedBy: string): Promise<void> {
  const uids = await activeMemberUids(groupId);
  await Promise.all(uids.map((uid) => suspendUserFor(uid, TEMP_BAN_DAYS).catch(() => {})));
  await updateDoc(doc(db, GROUP_REPORTS, reportId), {
    status: "resolved",
    resolution: "temp_banned",
    resolvedBy: actedBy,
    resolvedAt: new Date().toISOString(),
  });
}

/** Super Admin action — permanently bans every current member of the group. */
export async function permaBanGroupMembers(reportId: string, groupId: string, actedBy: string): Promise<void> {
  const uids = await activeMemberUids(groupId);
  await Promise.all(
    uids.map(async (uid) => {
      const profile = await getUserProfile(uid).catch(() => null);
      await permanentlyBanUser(uid, profile?.email ?? "", actedBy, "Group report: perma ban").catch(() => {});
    })
  );
  await updateDoc(doc(db, GROUP_REPORTS, reportId), {
    status: "resolved",
    resolution: "perma_banned",
    resolvedBy: actedBy,
    resolvedAt: new Date().toISOString(),
  });
}

/** Super Admin action — deletes the reported group outright. Unlike lib/dms.ts's deleteGroup()
 * (creator-only, for a member leaving/closing their own group), this is a moderation action on
 * someone else's group, gated by firestore.rules' isAdmin() branch on conversations/{id} delete. */
export async function adminDeleteGroupForReport(reportId: string, groupId: string, actedBy: string): Promise<void> {
  await deleteDoc(doc(db, CONVERSATIONS, groupId));
  await updateDoc(doc(db, GROUP_REPORTS, reportId), {
    status: "resolved",
    resolution: "group_deleted",
    resolvedBy: actedBy,
    resolvedAt: new Date().toISOString(),
  });
}
