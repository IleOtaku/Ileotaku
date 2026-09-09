"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { getFollowers, getFollowing } from "@/lib/social";
import type { UserProfile } from "@/types";
import FollowButton from "./FollowButton";

export interface FollowListModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  uid: string;
  mode: "followers" | "following";
}

/** Lists a user's followers or following — avatar, name, and a follow button per row. */
export default function FollowListModal({ open, onClose, title, uid, mode }: FollowListModalProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const fetcher = mode === "followers" ? getFollowers : getFollowing;
    fetcher(uid)
      .then((res) => {
        if (!cancelled) setUsers(res);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, uid, mode]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {/* No inner max-h/overflow-y-auto here — the Modal's own content area is already the
          scroll container; a second one nested inside it just fights the first over which
          actually scrolls. */}
      <div className="flex flex-col gap-3">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
        ) : users.length === 0 ? (
          <p className="py-6 text-center font-noto text-sm text-muted">Nobody here yet.</p>
        ) : (
          users.map((u) => (
            <div key={u.uid} className="flex items-center gap-3">
              <Link
                href={u.handle ? `/creator/${u.handle}` : "/profile"}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar uid={u.uid} photoURL={u.photoURL} displayName={u.displayName} size={40} />
                <span className="min-w-0 truncate font-syne text-sm font-semibold text-text">
                  {u.displayName}
                </span>
              </Link>
              <FollowButton
                targetUid={u.uid}
                initialFollowerCount={u.followers?.length ?? 0}
                hideCount
              />
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
