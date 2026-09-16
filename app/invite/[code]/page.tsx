import type { Metadata } from "next";
import InviteJoinClient from "@/components/messages/InviteJoinClient";

export const metadata: Metadata = {
  title: "Join Group",
};

export default function InvitePage({ params }: { params: { code: string } }) {
  return <InviteJoinClient code={params.code} />;
}
