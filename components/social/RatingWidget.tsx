"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Lock, Star } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getHistoryCountForManga, subscribeToRatings, submitRating } from "@/lib/firestore";
import type { SeriesRating } from "@/types";

export interface RatingWidgetProps {
  /** The creator-published work id — the key the underlying series/{id} doc is stored under. */
  seriesId: string;
}

type StarBucket = 1 | 2 | 3 | 4 | 5;

/** How many chapters of this series the reader must have opened before they can rate it. */
const READ_THRESHOLD = 3;

function emptyDistribution(): Record<StarBucket, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function bucketRatings(ratings: SeriesRating[]): Record<StarBucket, number> {
  const dist = emptyDistribution();
  ratings.forEach((r) => {
    const bucket = Math.min(5, Math.max(1, Math.round(r.rating))) as StarBucket;
    dist[bucket] += 1;
  });
  return dist;
}

/** Read-only 5-star row with half-star fill precision, used for the average display. */
function StarRow({ value, size }: { value: number; size: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const full = i + 1;
        const half = i + 0.5;
        const fillPct = value >= full ? 100 : value >= half ? 50 : 0;
        return (
          <span key={i} className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 ${size} text-bg4`} />
            <Star
              className={`absolute inset-0 ${size} fill-gold text-gold`}
              style={{ clipPath: `inset(0 ${100 - fillPct}% 0 0)` }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Interactive 5-star input with half-star precision — click the left/right half of a star. */
function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const full = i + 1;
        const half = i + 0.5;
        const fillPct = display >= full ? 100 : display >= half ? 50 : 0;
        return (
          <span key={i} className="relative inline-block h-11 w-11 sm:h-7 sm:w-7">
            <Star className="absolute inset-0 m-auto h-7 w-7 text-bg4 sm:h-7 sm:w-7" />
            <Star
              className="absolute inset-0 m-auto h-7 w-7 fill-gold text-gold sm:h-7 sm:w-7"
              style={{ clipPath: `inset(0 ${100 - fillPct}% 0 0)` }}
            />
            <button
              type="button"
              aria-label={`Rate ${half} stars`}
              className="absolute inset-y-0 left-0 w-1/2"
              onMouseEnter={() => setHover(half)}
              onClick={() => onChange(half)}
            />
            <button
              type="button"
              aria-label={`Rate ${full} stars`}
              className="absolute inset-y-0 right-0 w-1/2"
              onMouseEnter={() => setHover(full)}
              onClick={() => onChange(full)}
            />
          </span>
        );
      })}
      <span className="ml-2 font-noto text-sm text-muted">{display > 0 ? display.toFixed(1) : ""}</span>
    </div>
  );
}

/** Star rating + written review, with a rating-breakdown bar chart and a "read N chapters
 * first" gate. Writes to series/{seriesId}/ratings/{userId}; the average, count, distribution,
 * and "my rating" are all derived client-side from a live onSnapshot on that same collection
 * (Part 3's live-stats spec), so a rating from any reader shows up here in real time. */
export default function RatingWidget({ seriesId }: RatingWidgetProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<SeriesRating[]>([]);
  const [readEnough, setReadEnough] = useState(false);
  const [selected, setSelected] = useState(0);
  const [review, setReview] = useState("");
  const [reviewSpoiler, setReviewSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftTouched, setDraftTouched] = useState(false);

  const myRating = user ? (ratings.find((r) => r.userId === user.uid) ?? null) : null;
  const average = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0;
  const count = ratings.length;
  const distribution = bucketRatings(ratings);

  // Real-time — degrades to a zeroed, read-only-looking widget on error (e.g. rules not
  // deployed yet) rather than leaving it stuck on the loading skeleton.
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToRatings(seriesId, (live) => {
      setRatings(live);
      setLoading(false);
    });
    return unsub;
  }, [seriesId]);

  // Prefills the star input from my own live rating once (and again if I haven't started
  // editing yet) — doesn't fight a rating the reader is actively adjusting.
  useEffect(() => {
    if (draftTouched) return;
    if (myRating) {
      setSelected(myRating.rating);
      setReview(myRating.review ?? "");
      setReviewSpoiler(!!myRating.isSpoiler);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRating?.rating, myRating?.review, myRating?.isSpoiler, draftTouched]);

  useEffect(() => {
    if (!user) {
      setReadEnough(false);
      return;
    }
    let cancelled = false;
    getHistoryCountForManga(user.uid, seriesId).then((historyCount) => {
      if (!cancelled) setReadEnough(historyCount >= READ_THRESHOLD);
    });
    return () => {
      cancelled = true;
    };
  }, [seriesId, user]);

  async function handleSubmit() {
    if (!user || selected <= 0) return;
    setSubmitting(true);
    try {
      await submitRating(seriesId, user.uid, selected, review, reviewSpoiler);
      setDraftTouched(false);
      toast.success("Thanks for rating!");
    } catch {
      toast.error("Couldn't submit your rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-cinzel text-2xl text-gold">{average.toFixed(1)}</span>
            <StarRow value={average} size="h-5 w-5" />
          </div>
          <p className="mt-1 font-noto text-xs text-muted">
            {count.toLocaleString()} rating{count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          {([5, 4, 3, 2, 1] as StarBucket[]).map((star) => {
            const c = distribution[star];
            const pct = count > 0 ? (c / count) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 font-noto text-[11px] text-muted">
                <span className="w-3">{star}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg4">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-6 text-right">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-bg4 pt-5">
        {!user ? (
          <p className="font-noto text-sm text-muted">Sign in to rate this series.</p>
        ) : !readEnough ? (
          <p className="flex items-center gap-2 font-noto text-sm text-muted">
            <Lock className="h-4 w-4" /> Read {READ_THRESHOLD} chapters to rate this series.
          </p>
        ) : (
          <>
            <p className="mb-2 font-syne text-xs font-semibold text-muted">
              {myRating ? "Update your rating" : "Rate this series"}
            </p>
            <StarInput
              value={selected}
              onChange={(v) => {
                setDraftTouched(true);
                setSelected(v);
              }}
            />

            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Write a review (optional)"
              className="input-base mt-3 w-full resize-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 font-noto text-xs text-muted">
                <input
                  type="checkbox"
                  checked={reviewSpoiler}
                  onChange={(e) => setReviewSpoiler(e.target.checked)}
                  className="h-3.5 w-3.5 accent-clay"
                />
                Review contains spoilers
              </label>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || selected <= 0}
                className="btn-primary text-sm"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : myRating ? (
                  "Update Rating"
                ) : (
                  "Submit Rating"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
