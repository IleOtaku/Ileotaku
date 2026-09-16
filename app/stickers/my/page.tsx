import type { Metadata } from "next";
import MyStickersClient from "@/components/stickers/MyStickersClient";

export const metadata: Metadata = {
  title: "My Stickers",
};

export default function MyStickersPage() {
  return <MyStickersClient />;
}
