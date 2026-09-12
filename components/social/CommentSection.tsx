"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Ellipsis,
  Eye,
  Flag,
  Loader2,
  MessageCircle,
  Pencil,
  ShieldOff,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge } from "@/components/ui/Badges";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import MentionText from "@/components/ui/MentionText";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers } from "@/lib/blocking";
import { deleteComment, editComment, postComment, subscribeToComments, toggleCommentLike } from "@/lib/firestore";
import { formatPostTimestamp } from "@/lib/utils";
import BlockUserModal from "./BlockUserModal";
import ReportModal from "./ReportModal";
import type { SeriesComment } from "@/types";

export interface CommentSectionProps {
  /** The creator-published work id. */
  mangaId: string;
  /** When provided, shows this chapter's comments instead of the series-wide thread. */
  chapterId?: string;
  /**
   * "page" (default): normal document flow, composer above the list, used on the manga
   * detail page. "sheet": fills its parent's height with the comment list scrolling in its
   * own region and the composer pinned in a footer below it — used inside the mobile reader's
   * bottom-sheet Comments tab, where the parent constrains height and only the list should scroll.
   */
  variant?: "page" | "sheet";
}

type SortMode = "newest" | "top";

const PAGE_SIZE = 20;

interface CommentRowProps {
  comment: SeriesComment;
  isReply?: boolean;
  currentUid?: string;
  liked: boolean;
  isBlocked: boolean;
  replies: SeriesComment[];
  repliesShown: boolean;
  spoilerRevealed: boolean;
  replyOpen: boolean;
  replyText: string;
  menuOpen: boolean;
  isEditing: boolean;
  editDraft: string;
  onLike: () => void;
  onReplyToggle: () => void;
  onReplyTextChange: (v: string) => void;
  onReplySubmit: () => void;
  onRevealSpoiler: () => void;
  onShowReplies: () => void;
  onMenuToggle: () => void;
  onDelete: () => void;
  onEditStart: () => void;
  onEditDraftChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onReport: () => void;
  onBlock: () => void;
  renderReply: (reply: SeriesComment) => React.ReactNode;
}

const CommentRow = memo(function CommentRow({
  comment,
  isReply,
  currentUid,
  liked,
  isBlocked,
  replies,
  repliesShown,
  spoilerRevealed,
  replyOpen,
  replyText,
  menuOpen,
  isEditing,
  editDraft,
  onLike,
  onReplyToggle,
  onReplyTextChange,
  onReplySubmit,
  onRevealSpoiler,
  onShowReplies,
  onMenuToggle,
  onDelete,
  onEditStart,
  onEditDraftChange,
  onEditSave,
  onEditCancel,
  onReport,
  onBlock,
  renderReply,
}: CommentRowProps) {
  const isOwn = currentUid === comment.userId;

  if (isBlocked) {
    return (
      <div className={isReply ? "ml-10 mt-3" : "border-b border-bg4 py-4 last:border-0"}>
        <p className="flex items-center gap-2 font-noto text-xs italic text-muted">
          <ShieldOff className="h-3.5 w-3.5" /> Comment hidden
        </p>
      </div>
    );
  }

  return (
    <div className={isReply ? "ml-10 mt-3" : "border-b border-bg4 py-4 last:border-0"}>
      <div className="flex gap-3">
        <Avatar uid={comment.userId} photoURL={comment.userPhotoURL} displayName={comment.userName} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-syne text-sm font-semibold text-text">{comment.userName}</span>
            <VerificationBadge user={comment} />
            <PlatinumBadge isPlatinum={comment.isPlatinum} />
            <span className="font-noto text-[11px] text-muted">{formatPostTimestamp(comment.createdAt)}</span>
            {comment.isEdited && !comment.isDeleted && (
              <span className="font-noto text-[11px] text-muted">(edited)</span>
            )}
          </div>

          {comment.isDeleted ? (
            <p className="mt-1 font-noto text-sm italic text-muted">{comment.text}</p>
          ) : isEditing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => onEditDraftChange(e.target.value)}
                rows={2}
                className="input-base w-full resize-none text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={onEditSave} className="btn-primary px-3 py-1.5 text-xs">
                  Save
                </button>
                <button type="button" onClick={onEditCancel} className="btn-ghost px-3 py-1.5 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : comment.isSpoiler && !spoilerRevealed ? (
            <button
              type="button"
              onClick={onRevealSpoiler}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-dashed border-muted2 bg-bg3 px-3 py-2 font-noto text-xs text-muted"
            >
              <Eye className="h-3.5 w-3.5" /> Show spoiler
            </button>
          ) : (
            <p className="mt-1 font-noto text-sm text-text">
              <MentionText text={comment.text} />
            </p>
          )}

          {!comment.isDeleted && (
          <div className="mt-1 flex items-center gap-1 font-noto text-xs text-muted">
            <button
              type="button"
              onClick={onLike}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 py-2 ${liked ? "text-clay2" : ""}`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-clay2" : ""}`} /> {comment.likes.length}
            </button>
            {!isReply && (
              <button
                type="button"
                onClick={onReplyToggle}
                className="flex min-h-[44px] items-center rounded-lg px-2.5 py-2 font-semibold"
              >
                Reply
              </button>
            )}
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={onMenuToggle}
                aria-label="More options"
                className="flex h-11 w-11 items-center justify-center rounded-lg"
              >
                <Ellipsis className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="glass absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg p-1">
                  {isOwn && (
                    <button
                      type="button"
                      onClick={onEditStart}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-text hover:bg-bg4"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                  {isOwn && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-clay2 hover:bg-bg4"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onReport}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-text hover:bg-bg4"
                  >
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                  {!isOwn && (
                    <button
                      type="button"
                      onClick={onBlock}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-clay2 hover:bg-bg4"
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> Block @{comment.userName}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {replyOpen && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                rows={2}
                placeholder="Write a reply..."
                className="input-base flex-1 resize-none text-base"
                style={{ fontSize: "16px" }}
              />
              <button
                type="button"
                onClick={onReplySubmit}
                className="btn-primary w-full shrink-0 text-sm sm:w-auto"
              >
                Reply
              </button>
            </div>
          )}

          {!isReply && replies.length > 0 && !repliesShown && (
            <button
              type="button"
              onClick={onShowReplies}
              className="mt-2 font-syne text-xs font-semibold text-gold hover:underline"
            >
              Show {replies.length} repl{replies.length === 1 ? "y" : "ies"}
            </button>
          )}
          {!isReply && repliesShown && replies.map((r) => renderReply(r))}
        </div>
      </div>
    </div>
  );
});

/** Full threaded comment system: series-wide (no chapterId) or per-chapter, real-time. */
export default function CommentSection({ mangaId, chapterId, variant = "page" }: CommentSectionProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<SeriesComment[]>([]);
  const [take, setTake] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortMode>("newest");
  const [text, setText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [reportTarget, setReportTarget] = useState<{ id: string; userId: string } | null>(null);
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
  const [blockTarget, setBlockTarget] = useState<{ uid: string; name: string } | null>(null);

  useEffect(() => {
    return subscribeToComments(mangaId, chapterId, take, setComments, () => setComments([]));
  }, [mangaId, chapterId, take]);

  // Blocking is client-side filtering, not a query constraint — Firestore has no "not in an
  // arbitrary per-viewer list" operator, so every viewer's own blocklist is fetched once and
  // applied to whatever the comments query already returned.
  useEffect(() => {
    if (!user) {
      setBlockedUids(new Set());
      return;
    }
    getBlockedUsers(user.uid).then((uids) => setBlockedUids(new Set(uids)));
  }, [user]);

  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, SeriesComment[]>();
    comments.forEach((c) => {
      if (c.parentId) {
        const arr = map.get(c.parentId) ?? [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    });
    return map;
  }, [comments]);

  const sortedTopLevel = useMemo(() => {
    const copy = [...topLevel];
    if (sort === "top") copy.sort((a, b) => b.likes.length - a.likes.length);
    else copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return copy;
  }, [topLevel, sort]);

  async function handlePost() {
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await postComment(mangaId, chapterId, {
        userId: user.uid,
        userName: profile?.displayName ?? user.displayName ?? "Reader",
        ...(user.photoURL ? { userPhotoURL: user.photoURL } : {}),
        isVerified: profile?.isVerified === true,
        isPlatinum: profile?.isPlatinum === true,
        isPublisher: profile?.isPublisher === true,
        isFounder: profile?.isFounder === true,
        verifiedType: profile?.verifiedType ?? null,
        isAdmin: profile?.isAdmin === true,
        text: trimmed,
        isSpoiler,
        parentId: null,
      });
      setText("");
      setIsSpoiler(false);
    } catch {
      toast.error("Couldn't post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!user) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    try {
      await postComment(mangaId, chapterId, {
        userId: user.uid,
        userName: profile?.displayName ?? user.displayName ?? "Reader",
        ...(user.photoURL ? { userPhotoURL: user.photoURL } : {}),
        isVerified: profile?.isVerified === true,
        isPlatinum: profile?.isPlatinum === true,
        isPublisher: profile?.isPublisher === true,
        isFounder: profile?.isFounder === true,
        verifiedType: profile?.verifiedType ?? null,
        isAdmin: profile?.isAdmin === true,
        text: trimmed,
        isSpoiler: false,
        parentId,
      });
      setReplyText("");
      setReplyTo(null);
      setExpandedReplies((s) => new Set(s).add(parentId));
    } catch {
      toast.error("Couldn't post your reply.");
    }
  }

  async function handleLike(comment: SeriesComment) {
    if (!user) {
      toast.error("Sign in to like comments.");
      return;
    }
    const liked = comment.likes.includes(user.uid);
    try {
      await toggleCommentLike(mangaId, chapterId, comment.id, user.uid, liked);
    } catch {
      toast.error("Something went wrong.");
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment(mangaId, chapterId, commentId);
      toast.success("Comment deleted.");
    } catch {
      toast.error("Couldn't delete this comment.");
    }
    setOpenMenuId(null);
  }

  async function handleSaveEdit(commentId: string) {
    try {
      await editComment(mangaId, chapterId, commentId, editDraft);
      setEditingId(null);
    } catch {
      toast.error("Couldn't save your edit.");
    }
  }

  function renderRow(comment: SeriesComment, isReply?: boolean) {
    return (
      <CommentRow
        key={comment.id}
        comment={comment}
        isReply={isReply}
        currentUid={user?.uid}
        liked={user ? comment.likes.includes(user.uid) : false}
        isBlocked={blockedUids.has(comment.userId)}
        replies={repliesByParent.get(comment.id) ?? []}
        repliesShown={expandedReplies.has(comment.id)}
        spoilerRevealed={revealedSpoilers.has(comment.id)}
        replyOpen={replyTo === comment.id}
        replyText={replyText}
        menuOpen={openMenuId === comment.id}
        isEditing={editingId === comment.id}
        editDraft={editDraft}
        onLike={() => handleLike(comment)}
        onReplyToggle={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
        onReplyTextChange={setReplyText}
        onReplySubmit={() => handleReply(comment.id)}
        onRevealSpoiler={() => setRevealedSpoilers((s) => new Set(s).add(comment.id))}
        onShowReplies={() => setExpandedReplies((s) => new Set(s).add(comment.id))}
        onMenuToggle={() => setOpenMenuId(openMenuId === comment.id ? null : comment.id)}
        onDelete={() => handleDelete(comment.id)}
        onEditStart={() => {
          setEditingId(comment.id);
          setEditDraft(comment.text);
          setOpenMenuId(null);
        }}
        onEditDraftChange={setEditDraft}
        onEditSave={() => handleSaveEdit(comment.id)}
        onEditCancel={() => setEditingId(null)}
        onReport={() => {
          setReportTarget({ id: comment.id, userId: comment.userId });
          setOpenMenuId(null);
        }}
        onBlock={() => {
          setBlockTarget({ uid: comment.userId, name: comment.userName });
          setOpenMenuId(null);
        }}
        renderReply={(r) => renderRow(r, true)}
      />
    );
  }

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-cinzel text-xl text-text">
        <MessageCircle className="h-5 w-5 text-gold" /> Comments
      </h2>
      <div className="flex gap-1 rounded-full border border-muted2 bg-bg3 p-1">
        <button
          type="button"
          onClick={() => setSort("newest")}
          className={`min-h-[44px] rounded-full px-3.5 font-syne text-xs font-semibold ${sort === "newest" ? "bg-clay text-ivory" : "text-muted"}`}
        >
          Newest
        </button>
        <button
          type="button"
          onClick={() => setSort("top")}
          className={`min-h-[44px] rounded-full px-3.5 font-syne text-xs font-semibold ${sort === "top" ? "bg-clay text-ivory" : "text-muted"}`}
        >
          Top
        </button>
      </div>
    </div>
  );

  const composer = user ? (
    <div className="flex w-full gap-3">
      <Avatar
        uid={user.uid}
        photoURL={profile?.photoURL ?? user.photoURL ?? undefined}
        displayName={profile?.displayName ?? user.displayName ?? "U"}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Share your thoughts..."
          className="input-base w-full resize-none"
          style={{ minHeight: "80px", fontSize: "16px" }}
        />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 font-noto text-xs text-muted">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={(e) => setIsSpoiler(e.target.checked)}
              className="h-3.5 w-3.5 accent-clay"
            />
            Contains spoilers
          </label>
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !text.trim()}
            className="btn-primary w-full text-sm sm:w-auto"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <p className="rounded-xl border border-dashed border-muted2 bg-bg2 px-4 py-3 text-center font-noto text-sm text-muted">
      <Link href="/auth/login" className="text-gold hover:underline">
        Sign in
      </Link>{" "}
      to comment.
    </p>
  );

  const list = (
    <>
      {sortedTopLevel.length === 0 ? (
        <p className="py-6 text-center font-noto text-sm text-muted">No comments yet — be the first.</p>
      ) : (
        <div>{sortedTopLevel.map((c) => renderRow(c))}</div>
      )}

      {comments.length >= take && (
        <button
          type="button"
          onClick={() => setTake((t) => t + PAGE_SIZE)}
          className="btn-ghost mt-4 w-full justify-center text-sm"
        >
          Load more
        </button>
      )}
    </>
  );

  const reportModal = (
    <ReportModal
      open={reportTarget !== null}
      onClose={() => setReportTarget(null)}
      targetType="comment"
      targetId={reportTarget?.id ?? ""}
      targetUserId={reportTarget?.userId}
    />
  );

  const blockModal = user && (
    <BlockUserModal
      open={blockTarget !== null}
      onClose={() => setBlockTarget(null)}
      currentUid={user.uid}
      targetUid={blockTarget?.uid ?? ""}
      targetLabel={blockTarget?.name ?? ""}
      onBlocked={() => {
        // Hide their comments immediately rather than waiting on a full blocklist re-fetch.
        if (blockTarget) setBlockedUids((s) => new Set(s).add(blockTarget.uid));
        setBlockTarget(null);
      }}
    />
  );

  if (variant === "sheet") {
    // Fills the parent (the bottom-sheet Comments tab), which fixes the available height.
    // Only the header+list region scrolls; the composer stays pinned below it, always in view.
    return (
      <section className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4">
          {header}
          {list}
        </div>
        <div className="shrink-0 border-t border-bg4 bg-bg2 px-4 py-3">{composer}</div>
        {reportModal}
        {blockModal}
      </section>
    );
  }

  return (
    <section className="mt-4 w-full min-w-0">
      {header}
      <div className="mb-6">{composer}</div>
      {list}
      {reportModal}
      {blockModal}
    </section>
  );
}
