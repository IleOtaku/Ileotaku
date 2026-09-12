"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Loader2, Send, Smile, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge } from "@/components/ui/Badges";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import MentionText from "@/components/ui/MentionText";
import { useAuth } from "@/hooks/useAuth";
import {
  addFeedComment,
  deleteFeedComment,
  subscribeToFeedComments,
  toggleFeedCommentLike,
} from "@/lib/creatorFeed";
import { formatPostTimestamp } from "@/lib/utils";
import type { FeedComment } from "@/types";

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😍", "👏", "😢", "😮", "🙏", "💯", "🎉", "😊", "👀"];
/** How long a press-and-hold on a comment must last before it counts as a long press (mobile
 * "long press → Delete", matching MessagesClient's own long-press threshold). */
const LONG_PRESS_MS = 450;

export interface FeedCommentSheetProps {
  postId: string;
  /** Beta feedback: the post's own author can delete anyone's comment on their post, not just
   * their own — passed down so the long-press/⋯ menu can offer Delete for either case. */
  postAuthorUid?: string;
  open: boolean;
  onClose: () => void;
}

interface RowProps {
  postId: string;
  comment: FeedComment;
  isReply?: boolean;
  replies: FeedComment[];
  onReply: (comment: FeedComment) => void;
  onOpenMenu: (comment: FeedComment) => void;
}

function CommentRow({ postId, comment, isReply, replies, onReply, onOpenMenu }: RowProps) {
  const { user } = useAuth();
  const [repliesShown, setRepliesShown] = useState(false);
  const liked = !!user && comment.likes.includes(user.uid);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleLike() {
    if (!user) {
      toast.error("Sign in to like comments.");
      return;
    }
    try {
      await toggleFeedCommentLike(postId, comment.id, user.uid, liked);
    } catch {
      toast.error("Something went wrong.");
    }
  }

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => onOpenMenu(comment), LONG_PRESS_MS);
  }
  function handleTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  if (comment.isDeleted) {
    return (
      <div className={isReply ? "ml-10 mt-3" : "border-b border-white/10 py-3 last:border-0"}>
        <p className="font-noto text-xs italic text-white/40">This comment was deleted</p>
      </div>
    );
  }

  return (
    <div className={isReply ? "ml-10 mt-3" : "border-b border-white/10 py-3 last:border-0"}>
      <div
        className="flex gap-2.5"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(comment);
        }}
      >
        <Avatar uid={comment.uid} photoURL={comment.photoURL} displayName={comment.displayName} size={30} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-syne text-xs font-semibold text-white">
            {comment.displayName}
            <VerificationBadge user={comment} size={12} />
            <PlatinumBadge isPlatinum={comment.isPlatinum} className="h-3 w-3" />
            <span className="ml-0.5 font-noto text-[10px] font-normal text-white/40">{formatPostTimestamp(comment.createdAt)}</span>
          </p>
          <p className="mt-0.5 break-words font-noto text-sm text-white/90">
            <MentionText text={comment.text} />
          </p>
          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={handleLike}
              className={`flex items-center gap-1 font-noto text-[11px] ${liked ? "text-clay2" : "text-white/50"}`}
            >
              <Heart className={`h-3 w-3 ${liked ? "fill-clay2" : ""}`} /> {comment.likes.length || ""}
            </button>
            {!isReply && (
              <button type="button" onClick={() => onReply(comment)} className="font-noto text-[11px] font-semibold text-white/50">
                Reply
              </button>
            )}
          </div>
          {!isReply && replies.length > 0 && !repliesShown && (
            <button
              type="button"
              onClick={() => setRepliesShown(true)}
              className="mt-2 font-noto text-[11px] font-semibold text-plat"
            >
              View {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
          {!isReply &&
            repliesShown &&
            replies.map((r) => (
              <CommentRow key={r.id} postId={postId} comment={r} isReply replies={[]} onReply={onReply} onOpenMenu={onOpenMenu} />
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * TikTok-style comment sheet for a feed post — pulls up from the bottom on mobile (a fixed 70vh
 * panel; "draggable" here means swipe-down-to-dismiss via its own touch handlers rather than a
 * physics-based drag, matching how StoryViewer's own swipe-to-close works) and renders as a
 * right-side panel on desktop (md+). Real-time via onSnapshot — a comment posted by anyone shows
 * up immediately for everyone with the sheet open.
 */
export default function FeedCommentSheet({ postId, postAuthorUid, open, onClose }: FeedCommentSheetProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<FeedComment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    return subscribeToFeedComments(postId, setComments, () => setComments([]));
  }, [postId, open]);

  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, FeedComment[]>();
    comments.forEach((c) => {
      if (c.parentId) map.set(c.parentId, [...(map.get(c.parentId) ?? []), c]);
    });
    return map;
  }, [comments]);

  async function handleSubmit() {
    if (!user || !profile || !text.trim() || posting) return;
    setPosting(true);
    try {
      await addFeedComment(postId, {
        uid: user.uid,
        displayName: profile.displayName ?? user.displayName ?? "Reader",
        ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
        isVerified: profile.isVerified === true,
        isPlatinum: profile.isPlatinum === true,
        isPublisher: profile.isPublisher === true,
        isFounder: profile.isFounder === true,
        verifiedType: profile.verifiedType ?? null,
        isAdmin: profile.isAdmin === true,
        text: text.trim(),
        parentId: replyTo?.id ?? null,
      });
      setText("");
      setReplyTo(null);
    } catch {
      toast.error("Couldn't post your comment.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(comment: FeedComment) {
    setMenuFor(null);
    try {
      await deleteFeedComment(postId, comment.id);
    } catch {
      toast.error("Couldn't delete this comment.");
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setDragY(dy);
  }
  function handleTouchEnd() {
    if (dragY > 100) onClose();
    setDragY(0);
    touchStartY.current = null;
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 md:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: dragY }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[111] flex h-[70vh] flex-col rounded-t-2xl bg-[#161616] md:absolute md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[360px] md:rounded-none md:border-l md:border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-white/20 md:hidden" />
              <p className="absolute left-4 font-syne text-sm font-semibold text-white">
                {comments.filter((c) => !c.isDeleted).length} comments
              </p>
              <button type="button" onClick={onClose} className="absolute right-4 text-white/60 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              {topLevel.length === 0 ? (
                <p className="py-10 text-center font-noto text-sm text-white/50">No comments yet — say something!</p>
              ) : (
                topLevel.map((c) => (
                  <CommentRow
                    key={c.id}
                    postId={postId}
                    comment={c}
                    replies={repliesByParent.get(c.id) ?? []}
                    onReply={(comment) => {
                      setReplyTo(comment);
                      inputRef.current?.focus();
                    }}
                    onOpenMenu={setMenuFor}
                  />
                ))
              )}
            </div>

            {replyTo && (
              <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-white/5 px-4 py-2">
                <p className="truncate font-noto text-xs text-white/60">Replying to {replyTo.displayName}</p>
                <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                  <X className="h-3.5 w-3.5 text-white/60" />
                </button>
              </div>
            )}

            {emojiOpen && (
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 bg-[#1d1d1d] p-3">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setText((t) => t + emoji)}
                    className="text-xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <div
              className="flex shrink-0 items-center gap-2 border-t border-white/10 p-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((o) => !o)}
                    aria-label="Emoji picker"
                    className="shrink-0 text-white/60 hover:text-white"
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-noto text-sm text-white placeholder:text-white/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!text.trim() || posting}
                    aria-label="Send comment"
                    className="shrink-0 text-plat disabled:opacity-40"
                  >
                    {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </>
              ) : (
                <p className="w-full text-center font-noto text-xs text-white/50">Sign in to comment.</p>
              )}
            </div>
          </motion.div>

          {menuFor && (
            <>
              <div className="fixed inset-0 z-[115]" onClick={() => setMenuFor(null)} />
              <div className="fixed bottom-24 left-1/2 z-[116] w-56 -translate-x-1/2 overflow-hidden rounded-xl bg-[#232323] p-1.5 shadow-2xl">
                {(user?.uid === menuFor.uid || (!!user && user.uid === postAuthorUid)) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(menuFor)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-noto text-sm text-clay2 hover:bg-white/10"
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMenuFor(null)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-noto text-sm text-white hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
