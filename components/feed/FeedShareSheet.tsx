"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { BookImage, Check, Copy, Link2, Loader2, Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { sendDM, startConversation } from "@/lib/dms";
import { searchUsers } from "@/lib/firestore";
import { createStory } from "@/lib/stories";
import { trackShare } from "@/lib/creatorFeed";
import type { CreatorPost, UserProfile } from "@/types";

export interface FeedShareSheetProps {
  post: CreatorPost;
  open: boolean;
  onClose: () => void;
}

/** TikTok-style share sheet: DMs (search + send), Share to Story, Copy Link, and the native Web
 * Share API on browsers that support it. Every option that completes calls trackShare() so the
 * post's forYouScore reflects it (see calculateForYouScore's +60 share weight). */
export default function FeedShareSheet({ post, open, onClose }: FeedShareSheetProps) {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [postingStory, setPostingStory] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/feed/${post.id}` : "";

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchUsers(trimmed)
        .then((res) => setResults(res.filter((p) => p.uid !== user?.uid)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, user]);

  async function handleSendToDM(targetUid: string) {
    if (!user) return;
    setSendingTo(targetUid);
    try {
      const convoId = await startConversation(user.uid, targetUid);
      await sendDM(convoId, user.uid, `Check out this post: ${shareUrl}`);
      await trackShare(post.id);
      toast.success("Sent!");
      onClose();
    } catch {
      toast.error("Couldn't send that.");
    } finally {
      setSendingTo(null);
    }
  }

  async function handleShareToStory() {
    if (!user || !profile) return;
    setPostingStory(true);
    try {
      await createStory(user.uid, profile, {
        kind: "text",
        textContent: `${post.displayName}: ${post.content.slice(0, 120)}\n\n${shareUrl}`,
        backgroundColor: "#1a1510",
      });
      await trackShare(post.id);
      toast.success("Shared to your story!");
      onClose();
    } catch {
      toast.error("Couldn't share to your story.");
    } finally {
      setPostingStory(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      await trackShare(post.id);
      toast.success("Link copied!");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  async function handleNativeShare() {
    if (!navigator.share) return;
    try {
      await navigator.share({ title: `${post.displayName} on ÍléOtaku`, text: post.content, url: shareUrl });
      await trackShare(post.id);
    } catch {
      // User cancelled the share sheet — not an error.
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[111] flex max-h-[75vh] flex-col rounded-t-2xl bg-[#161616] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="font-syne text-sm font-semibold text-white">Share</p>
              <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people to send to..."
                  className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2.5 font-noto text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
              </div>

              {query.trim() && (
                <div className="mt-3 flex flex-col gap-1">
                  {searching ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="py-4 text-center font-noto text-xs text-white/40">No one found.</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.uid}
                        type="button"
                        onClick={() => handleSendToDM(p.uid)}
                        disabled={sendingTo !== null}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 disabled:opacity-50"
                      >
                        <Avatar uid={p.uid} photoURL={p.photoURL} displayName={p.displayName} size={36} />
                        <span className="min-w-0 flex-1 truncate font-noto text-sm text-white">{p.displayName}</span>
                        {sendingTo === p.uid ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                        ) : (
                          <Send className="h-4 w-4 text-white/60" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={handleShareToStory}
                  disabled={postingStory}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 p-3 text-center disabled:opacity-50"
                >
                  {postingStory ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <BookImage className="h-6 w-6 text-white" />
                  )}
                  <span className="font-noto text-[11px] text-white/80">Your Story</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 p-3 text-center"
                >
                  {copied ? <Check className="h-6 w-6 text-green2" /> : <Link2 className="h-6 w-6 text-white" />}
                  <span className="font-noto text-[11px] text-white/80">Copy Link</span>
                </button>
                {typeof navigator !== "undefined" && !!navigator.share && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 p-3 text-center"
                  >
                    <Copy className="h-6 w-6 text-white" />
                    <span className="font-noto text-[11px] text-white/80">More</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
