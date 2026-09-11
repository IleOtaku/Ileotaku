"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  BadgeCheck,
  Eye,
  FileStack,
  LineChart,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCreatorWorks, getUserProfile, subscribeToCreatorWorks, updateUserPrefs } from "@/lib/firestore";
import CreatorFeedTab from "@/components/creator/CreatorFeedTab";
import WorkCard from "@/components/creator/WorkCard";
import UploadModal from "@/components/creator/UploadModal";
import AddChapterModal from "@/components/creator/AddChapterModal";
import AddProseChapterModal from "@/components/creator/AddProseChapterModal";
import ChapterDraftsModal from "@/components/creator/ChapterDraftsModal";
import DeleteWorkModal from "@/components/creator/DeleteWorkModal";
import EditSeriesModal from "@/components/creator/EditSeriesModal";
import TransferOwnershipModal from "@/components/creator/TransferOwnershipModal";
import EarningsChart from "@/components/creator/EarningsChart";
import { EmptyState, SectionEyebrow, Skeleton, Tabs } from "@/components/ui";
import { getPendingTransfersFor, respondToOwnershipTransfer } from "@/lib/publishedSeries";
import type { CreatorWork, OwnershipTransferRequest } from "@/types";

const FEATURE_CHIPS = [
  {
    icon: ShieldCheck,
    label: "Copyright Protection",
    text: "Every submission is fingerprinted and monitored across the web.",
  },
  {
    icon: LineChart,
    label: "Analytics",
    text: "Real-time reads, retention and revenue insight for every chapter.",
  },
  {
    icon: Wallet,
    label: "Revenue Share",
    text: "Keep the majority of every coin, ad and Platinum read you earn.",
  },
  {
    icon: BadgeCheck,
    label: "Editorial Support",
    text: "Our team helps polish your series before it goes live.",
  },
];

const GUIDELINES = [
  { title: "Original Work", text: "Only submit work you created or hold full rights to publish." },
  {
    title: "Content Standards",
    text: "No hate speech, harassment, or content that violates our community guidelines.",
  },
  {
    title: "Review Process",
    text: "Submissions are reviewed within 5-7 business days by our editorial team.",
  },
  {
    title: "Copyright",
    text: "You retain full copyright — ÍléOtaku only holds a license to distribute.",
  },
  {
    title: "Revenue Timeline",
    text: "Earnings are calculated monthly and paid out within 15 days of month-end.",
  },
  {
    title: "Removal Policy",
    text: "Repeated violations or plagiarism reports may result in the work being removed.",
  },
];

type TabValue = "works" | "feed" | "earnings" | "guidelines";

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <Icon className="h-5 w-5 text-gold" />
      <p className="mt-3 font-cinzel text-xl text-text">{value}</p>
      <p className="font-noto text-xs text-muted">{label}</p>
    </div>
  );
}

export default function CreatorDashboardClient() {
  const { user, profile, loading } = useAuth();
  const [activating, setActivating] = useState(false);
  const [works, setWorks] = useState<CreatorWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [chapterWorkId, setChapterWorkId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>("works");
  const [editingWork, setEditingWork] = useState<CreatorWork | null>(null);
  const [deletingWork, setDeletingWork] = useState<CreatorWork | null>(null);
  const [draftsWorkId, setDraftsWorkId] = useState<string | null>(null);
  const [transferringWork, setTransferringWork] = useState<CreatorWork | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<OwnershipTransferRequest[]>([]);

  const isCreator = profile?.isCreator === true;

  const refreshWorks = useCallback(async () => {
    if (!user) return;
    setWorksLoading(true);
    try {
      const list = await getCreatorWorks(user.uid);
      setWorks(list);
    } catch {
      toast.error("Couldn't load your works.");
    } finally {
      setWorksLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isCreator) {
      refreshWorks();
    }
  }, [isCreator, refreshWorks]);

  // Real-time on top of the initial fetch above — a work's `earnings` (bumped whenever a reader
  // unlocks one of its chapters) and `views` now update live instead of only refreshing on the
  // specific actions (upload, add chapter) that happen to call refreshWorks() themselves.
  useEffect(() => {
    if (!user || !isCreator) return;
    return subscribeToCreatorWorks(user.uid, setWorks);
  }, [user, isCreator]);

  const refreshPendingTransfers = useCallback(async () => {
    if (!user) return;
    try {
      setPendingTransfers(await getPendingTransfersFor(user.uid));
    } catch {
      setPendingTransfers([]);
    }
  }, [user]);

  useEffect(() => {
    if (isCreator) refreshPendingTransfers();
  }, [isCreator, refreshPendingTransfers]);

  async function handleTransferResponse(requestId: string, accept: boolean) {
    try {
      await respondToOwnershipTransfer(requestId, accept);
      toast.success(accept ? "Series transferred to you!" : "Request declined.");
      setPendingTransfers((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      toast.error("Couldn't process this request.");
    }
  }

  async function handleActivate() {
    if (!user) return;
    setActivating(true);
    try {
      await updateUserPrefs(user.uid, { isCreator: true });
      const fresh = await getUserProfile(user.uid);
      useAuth.getState().setProfile(fresh);
      toast.success("Creator account activated!");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActivating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 sm:px-6">
        <EmptyState
          title="Sign in to access the Creator Studio"
          description="Create a free ÍléOtaku account to start publishing your work."
          action={
            <Link href="/auth/signup" className="btn-primary">
              Create Account
            </Link>
          }
        />
      </div>
    );
  }

  const totalWorks = works.length;
  const totalViews = works.reduce((sum, w) => sum + w.views, 0);
  const published = works.filter((w) => w.status === "published").length;
  const totalEarned = works.reduce((sum, w) => sum + w.earnings, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <section className="flex flex-col items-start justify-between gap-6 border-b border-bg4 pb-10 sm:flex-row sm:items-end">
        <div>
          <SectionEyebrow>Creator Studio</SectionEyebrow>
          <h1 className="font-cinzel text-3xl text-text">
            {isCreator ? "Your creator dashboard" : "Publish your stories on ÍléOtaku"}
          </h1>
          <p className="mt-2 max-w-xl font-noto text-sm text-muted">
            {isCreator
              ? "Track every series, its earnings and where it stands in review."
              : "Reach readers across 54 countries and earn directly from every chapter they read."}
          </p>
        </div>

        {isCreator ? (
          <button type="button" onClick={() => setUploadOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Upload New Work
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            disabled={activating}
            className="btn-primary"
          >
            {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Become a Creator"}
          </button>
        )}
      </section>

      {!isCreator ? (
        <section className="mt-12 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-syne text-lg font-semibold text-text">Why publish with us</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURE_CHIPS.map((chip) => (
                <div key={chip.label} className="rounded-xl border border-bg4 bg-bg2 p-4">
                  <chip.icon className="h-5 w-5 text-gold" />
                  <p className="mt-2 font-syne text-sm font-semibold text-text">{chip.label}</p>
                  <p className="mt-1 font-noto text-xs text-muted">{chip.text}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleActivate}
              disabled={activating}
              className="btn-primary mt-8"
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Activate Creator Account"
              )}
            </button>
          </div>

          <div className="glass rounded-2xl p-6">
            <p className="font-syne text-xs uppercase tracking-[0.2em] text-muted">
              Where every coin goes
            </p>
            <EarningsChart />
          </div>
        </section>
      ) : (
        <>
          <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={FileStack} label="Total Works" value={totalWorks.toString()} />
            <StatCard icon={Eye} label="Total Views" value={totalViews.toLocaleString()} />
            <StatCard icon={BadgeCheck} label="Published" value={published.toString()} />
            <StatCard icon={Wallet} label="Total Earned" value={`$${totalEarned.toFixed(2)}`} />
          </section>

          {pendingTransfers.length > 0 && (
            <section className="mt-8 flex flex-col gap-3">
              {pendingTransfers.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4"
                >
                  <p className="font-noto text-sm text-text">
                    <span className="font-semibold">{req.fromDisplayName}</span> wants to transfer{" "}
                    <span className="font-semibold text-gold">{req.workTitle}</span> to you.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleTransferResponse(req.id, false)}
                      className="btn-ghost text-xs"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTransferResponse(req.id, true)}
                      className="btn-primary text-xs"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="mt-10">
            <Tabs
              tabs={[
                { label: "Works", value: "works" },
                { label: "Feed", value: "feed" },
                { label: "Earnings", value: "earnings" },
                { label: "Guidelines", value: "guidelines" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as TabValue)}
            />

            <div className="mt-8">
              {tab === "works" &&
                (worksLoading ? (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-72 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : works.length === 0 ? (
                  <div className="mx-auto max-w-md py-16">
                    <EmptyState
                      icon={<span className="text-4xl">🎨</span>}
                      title="No Works Yet"
                      description="Submit your first series to get started."
                      action={
                        <button
                          type="button"
                          onClick={() => setUploadOpen(true)}
                          className="btn-primary"
                        >
                          <Plus className="h-4 w-4" /> Upload New Work
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {works.map((work) => (
                      <WorkCard
                        key={work.id}
                        work={work}
                        onAddChapter={() => setChapterWorkId(work.id)}
                        onEditSeries={() => setEditingWork(work)}
                        onDeleteWork={() => setDeletingWork(work)}
                        onViewDrafts={() => setDraftsWorkId(work.id)}
                        onTransferOwnership={() => setTransferringWork(work)}
                      />
                    ))}
                  </div>
                ))}

              {tab === "feed" && <CreatorFeedTab uid={user.uid} />}

              {tab === "earnings" && (
                <div className="max-w-lg rounded-2xl border border-bg4 bg-bg2 p-6">
                  <p className="font-syne text-xs uppercase tracking-[0.2em] text-muted">
                    Total earned
                  </p>
                  <p className="mt-1 font-cinzel text-3xl text-gold">${totalEarned.toFixed(2)}</p>
                  <EarningsChart />
                  <p className="mt-6 font-noto text-xs text-muted">
                    Payouts are calculated monthly and sent within 15 days of month-end via your
                    preferred payout method.
                  </p>
                </div>
              )}

              {tab === "guidelines" && (
                <div className="flex flex-col gap-6">
                  <div className="rounded-2xl border border-clay/40 bg-clay/5 p-5">
                    <h3 className="font-syne text-sm font-semibold text-clay2">
                      How Feed monetization works
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2 font-noto text-xs text-muted">
                      <li>
                        <span className="font-semibold text-text">Resolution costs coins.</span>{" "}
                        Posting a photo or video above the free base resolution (Standard for
                        photos, 480p for video) spends coins per post — Platinum members post at
                        every resolution for free.
                      </li>
                      <li>
                        <span className="font-semibold text-text">Boosts are optional and paid.</span>{" "}
                        Spending coins to boost a post multiplies its For You ranking score for a
                        limited window; it never guarantees placement on its own — a boosted post
                        with no real engagement still ranks low once the boost expires.
                      </li>
                      <li>
                        <span className="font-semibold text-text">For You ranks on engagement, not payment.</span>{" "}
                        Likes, comments, views, and watch time (weighted against how recently you
                        posted) are what earn a spot in For You for every eligible creator — coins
                        only ever amplify a score that already exists.
                      </li>
                      <li>
                        <span className="font-semibold text-text">Coins you spend on the Feed go toward the platform</span>,
                        the same as chapter unlocks or roulette spins — they are separate from the
                        revenue share your published works earn from reads, tips, and Platinum
                        subscriptions.
                      </li>
                    </ul>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {GUIDELINES.map((g) => (
                      <div key={g.title} className="rounded-xl border border-bg4 bg-bg2 p-4">
                        <h3 className="font-syne text-sm font-semibold text-text">{g.title}</h3>
                        <p className="mt-1.5 font-noto text-xs text-muted">{g.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        creatorId={user.uid}
        onUploaded={refreshWorks}
      />

      {chapterWorkId &&
        (works.find((w) => w.id === chapterWorkId)?.format?.toLowerCase() === "prose" ? (
          <AddProseChapterModal
            open={!!chapterWorkId}
            onClose={() => setChapterWorkId(null)}
            workId={chapterWorkId}
            suggestedNumber={(works.find((w) => w.id === chapterWorkId)?.chapterCount ?? 0) + 1}
            onAdded={refreshWorks}
          />
        ) : (
          <AddChapterModal
            open={!!chapterWorkId}
            onClose={() => setChapterWorkId(null)}
            workId={chapterWorkId}
            suggestedNumber={(works.find((w) => w.id === chapterWorkId)?.chapterCount ?? 0) + 1}
            onAdded={refreshWorks}
          />
        ))}

      <EditSeriesModal
        open={editingWork !== null}
        onClose={() => setEditingWork(null)}
        work={editingWork}
        // No manual state patch needed — works is a live subscribeToCreatorWorks() listener
        // (see the effect above), so the edit reflects here the moment Firestore confirms it.
        onSaved={() => {}}
      />

      <DeleteWorkModal
        open={deletingWork !== null}
        onClose={() => setDeletingWork(null)}
        work={deletingWork}
        onDeleted={() => {}}
      />

      <ChapterDraftsModal
        open={draftsWorkId !== null}
        onClose={() => setDraftsWorkId(null)}
        workId={draftsWorkId}
        onPublished={refreshWorks}
      />

      <TransferOwnershipModal
        open={transferringWork !== null}
        onClose={() => setTransferringWork(null)}
        work={transferringWork}
        fromUid={user.uid}
        fromDisplayName={profile?.displayName ?? user.displayName ?? "A creator"}
      />
    </div>
  );
}
