/**
 * PART 6 — Sticker packs. Two official free starter packs (seeded by scripts/seed-stickers.js)
 * plus creator-submitted packs (Platinum creators, reviewed by an admin before appearing in the
 * store) — see types/index.ts's StickerPack/StickerItem for the schema this reads and writes.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";
import { getUserProfile, updateUserPrefs } from "./firestore";
import type { StickerItem, StickerPack } from "@/types";

const PACKS = "stickerPacks";
const STICKERS = "stickers";
const USER_PACKS = "stickerPacks";
const SAVED_STICKERS = "savedStickers";
/** Beta feedback: "Creator earns 70% of coin purchases of their pack." */
const CREATOR_SHARE = 0.7;

function toPack(id: string, data: Record<string, unknown>): StickerPack {
  return { id, ...data } as StickerPack;
}

/** Every pack visible in the store: official packs (always visible) plus creator packs that have
 * cleared admin review. One unfiltered fetch + client-side split rather than several composite
 * queries — pack counts are small enough that this is simpler and just as fast. */
export async function getStorePacks(): Promise<{ free: StickerPack[]; premium: StickerPack[] }> {
  try {
    const snap = await getDocs(collection(db, PACKS));
    const visible = snap.docs
      .map((d) => toPack(d.id, d.data()))
      .filter((p) => p.isOfficial || p.status === "approved");
    return {
      free: visible.filter((p) => p.price === 0),
      premium: visible.filter((p) => p.price > 0),
    };
  } catch (error) {
    await logError(error, { operation: "stickers.getStorePacks" });
    return { free: [], premium: [] };
  }
}

export async function getPackStickers(packId: string): Promise<StickerItem[]> {
  try {
    const snap = await getDocs(query(collection(db, PACKS, packId, STICKERS), orderBy("order", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StickerItem);
  } catch (error) {
    await logError(error, { operation: "stickers.getPackStickers", packId });
    return [];
  }
}

export async function getUserOwnedPackIds(uid: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, "users", uid, USER_PACKS));
    return snap.docs.map((d) => d.id);
  } catch (error) {
    await logError(error, { operation: "stickers.getUserOwnedPackIds", uid });
    return [];
  }
}

/** Every pack `uid` owns, each with its full sticker list already loaded — powers the DM sticker
 * picker's "My Packs" tab, which needs to render the whole grid immediately on opening a pack. */
export async function getOwnedPacksWithStickers(
  uid: string
): Promise<{ pack: StickerPack; stickers: StickerItem[] }[]> {
  const packIds = await getUserOwnedPackIds(uid);
  if (packIds.length === 0) return [];
  const results = await Promise.all(
    packIds.map(async (packId) => {
      const [packSnap, stickers] = await Promise.all([getDoc(doc(db, PACKS, packId)), getPackStickers(packId)]);
      if (!packSnap.exists()) return null;
      return { pack: toPack(packSnap.id, packSnap.data()), stickers };
    })
  );
  return results.filter((r): r is { pack: StickerPack; stickers: StickerItem[] } => r !== null);
}

export async function addFreePackToUser(uid: string, packId: string): Promise<void> {
  try {
    await setDoc(doc(db, "users", uid, USER_PACKS, packId), { addedAt: new Date().toISOString() });
    await updateDoc(doc(db, PACKS, packId), { downloads: increment(1) });
  } catch (error) {
    await logError(error, { operation: "stickers.addFreePackToUser", uid, packId });
    throw error;
  }
}

export interface PurchasePackResult {
  success: boolean;
  message?: string;
}

/** Deducts `pack.price` coins from `uid`, adds the pack to their collection, and — for a
 * creator (non-official) pack — credits the creator CREATOR_SHARE of the price. Best-effort on
 * the creator-credit half: a failure there is logged but never blocks the buyer's own purchase
 * from completing, since they already paid and own the pack either way. */
export async function purchasePack(uid: string, packId: string): Promise<PurchasePackResult> {
  try {
    const [packSnap, profile] = await Promise.all([getDoc(doc(db, PACKS, packId)), getUserProfile(uid)]);
    if (!packSnap.exists()) return { success: false, message: "This pack no longer exists." };
    const pack = toPack(packSnap.id, packSnap.data());
    if (pack.price <= 0) return { success: false, message: "This pack is free — use Add instead." };
    if (!profile || (profile.coins ?? 0) < pack.price) {
      return { success: false, message: `Not enough coins — this pack costs ${pack.price}.` };
    }

    const newBalance = profile.coins - pack.price;
    await updateUserPrefs(uid, { coins: newBalance });
    await addDoc(collection(db, "users", uid, "transactions"), {
      userId: uid,
      type: "purchase",
      amount: -pack.price,
      balanceAfter: newBalance,
      description: `Sticker pack: ${pack.name}`,
      createdAt: new Date().toISOString(),
    });
    await addFreePackToUser(uid, packId);

    if (pack.creatorUid && !pack.isOfficial) {
      try {
        const creatorProfile = await getUserProfile(pack.creatorUid);
        if (creatorProfile) {
          const creatorEarnings = Math.round(pack.price * CREATOR_SHARE * 10) / 10;
          const creatorBalance = (creatorProfile.coins ?? 0) + creatorEarnings;
          await updateUserPrefs(pack.creatorUid, { coins: creatorBalance });
          await addDoc(collection(db, "users", pack.creatorUid, "transactions"), {
            userId: pack.creatorUid,
            type: "reward",
            amount: creatorEarnings,
            balanceAfter: creatorBalance,
            description: `Sticker pack sale: ${pack.name}`,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        await logError(error, { operation: "stickers.purchasePack.creatorCredit", packId });
      }
    }

    return { success: true };
  } catch (error) {
    await logError(error, { operation: "stickers.purchasePack", uid, packId });
    return { success: false, message: "Couldn't complete this purchase. Please try again." };
  }
}

/** "Long press on received sticker → Save Sticker" — an individual sticker image, saved
 * independent of whether the viewer owns the pack it came from. Shows in the picker's own
 * "Recently Used" tab (which doubles as "recently saved" — see StickerPicker.tsx). */
export async function saveSticker(uid: string, stickerUrl: string): Promise<void> {
  try {
    await addDoc(collection(db, "users", uid, SAVED_STICKERS), {
      url: stickerUrl,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError(error, { operation: "stickers.saveSticker", uid });
  }
}

export async function getSavedStickers(uid: string, take = 24): Promise<{ id: string; url: string }[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "users", uid, SAVED_STICKERS), orderBy("savedAt", "desc"), limit(take))
    );
    return snap.docs.map((d) => ({ id: d.id, url: (d.data().url as string) ?? "" }));
  } catch (error) {
    await logError(error, { operation: "stickers.getSavedStickers", uid });
    return [];
  }
}

/* ---------------------------- Creator uploads (Platinum) ---------------------------- */

export interface SubmitStickerPackInput {
  name: string;
  description: string;
  price: number;
  stickerUrls: string[];
}

/** Beta feedback: "Creators can create their own sticker packs... Submit for review → admin
 * approves → pack appears in store." Starts life as `status: "pending"` — invisible in
 * getStorePacks() until an admin flips it to "approved" (see approveStickerPack below). */
export async function submitStickerPack(
  creatorUid: string,
  creatorName: string,
  input: SubmitStickerPackInput
): Promise<string> {
  if (input.stickerUrls.length === 0) throw new Error("Add at least one sticker.");
  if (input.stickerUrls.length > 24) throw new Error("A pack can have at most 24 stickers.");
  try {
    const packRef = await addDoc(collection(db, PACKS), {
      name: input.name.trim(),
      description: input.description.trim(),
      artist: creatorName,
      coverStickerUrl: input.stickerUrls[0],
      previewUrls: input.stickerUrls.slice(0, 3),
      stickerCount: input.stickerUrls.length,
      price: Math.max(0, Math.round(input.price)),
      isOfficial: false,
      downloads: 0,
      creatorUid,
      creatorName,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await Promise.all(
      input.stickerUrls.map((url, i) =>
        addDoc(collection(db, PACKS, packRef.id, STICKERS), { url, keywords: [], order: i })
      )
    );

    return packRef.id;
  } catch (error) {
    await logError(error, { operation: "stickers.submitStickerPack", creatorUid });
    throw error;
  }
}

export async function getMyStickerPacks(creatorUid: string): Promise<StickerPack[]> {
  try {
    const snap = await getDocs(query(collection(db, PACKS), where("creatorUid", "==", creatorUid)));
    return snap.docs.map((d) => toPack(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "stickers.getMyStickerPacks", creatorUid });
    return [];
  }
}

/* ---------------------------- Admin review ---------------------------- */

export async function getPendingStickerPacks(): Promise<StickerPack[]> {
  try {
    const snap = await getDocs(query(collection(db, PACKS), where("status", "==", "pending")));
    return snap.docs.map((d) => toPack(d.id, d.data()));
  } catch (error) {
    await logError(error, { operation: "stickers.getPendingStickerPacks" });
    return [];
  }
}

export async function approveStickerPack(packId: string): Promise<void> {
  await updateDoc(doc(db, PACKS, packId), { status: "approved" });
}

export async function rejectStickerPack(packId: string): Promise<void> {
  await updateDoc(doc(db, PACKS, packId), { status: "rejected" });
}

export async function deleteStickerPack(packId: string): Promise<void> {
  const stickersSnap = await getDocs(collection(db, PACKS, packId, STICKERS));
  await Promise.all(stickersSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, PACKS, packId));
}
