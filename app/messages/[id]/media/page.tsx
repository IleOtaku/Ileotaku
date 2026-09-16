import type { Metadata } from "next";
import ConversationMediaClient from "@/components/messages/ConversationMediaClient";

export const metadata: Metadata = {
  title: "Shared Media",
};

export default function ConversationMediaPage({ params }: { params: { id: string } }) {
  return <ConversationMediaClient conversationId={params.id} />;
}
