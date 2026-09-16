"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Clock, Loader2, Plus, Upload, X, XCircle } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { uploadImage } from "@/lib/cloudinary";
import { getMyStickerPacks, submitStickerPack } from "@/lib/stickers";
import type { StickerPack } from "@/types";

export interface CreatorStickerPacksTabProps {
  creatorUid: string;
  creatorName: string;
}

const MAX_STICKERS = 24;
const MAX_UPLOAD_BYTES = 1 * 1024 * 1024; // 1MB — PNGs this small are plenty for a sticker

function StatusBadge({ status }: { status?: StickerPack["status"] }) {
  if (status === "approved") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-green2">
        <CheckCircle2 className="h-3 w-3" /> Live in store
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-clay2">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-gold2">
      <Clock className="h-3 w-3" /> Pending review
    </span>
  );
}

/** PART 6 — Sticker packs, creator upload (Platinum only). Upload up to 24 stickers, name/
 * describe/price the pack, and submit for admin review — see lib/stickers.ts's
 * submitStickerPack/approveStickerPack for the review lifecycle this feeds into. */
export default function CreatorStickerPacksTab({ creatorUid, creatorName }: CreatorStickerPacksTabProps) {
  const [myPacks, setMyPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMyStickerPacks(creatorUid)
      .then(setMyPacks)
      .finally(() => setLoading(false));
  }, [creatorUid]);

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_STICKERS - files.length;
    if (room <= 0) {
      toast.error(`A pack can have at most ${MAX_STICKERS} stickers.`);
      return;
    }
    const accepted = picked.slice(0, room).filter((f) => {
      if (f.type !== "image/png") {
        toast.error(`${f.name}: only PNG files are supported.`);
        return false;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name} is too large — stickers should be under 1MB.`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Give your pack a name.");
      return;
    }
    if (files.length === 0) {
      toast.error("Add at least one sticker.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(({ file }) => uploadImage(file, `stickers/${creatorUid}`)));
      await submitStickerPack(creatorUid, creatorName, {
        name: name.trim(),
        description: description.trim(),
        price: Number(price) || 0,
        stickerUrls: uploaded.map((u) => u.secureUrl),
      });
      toast.success("Submitted for review!");
      setMyPacks(await getMyStickerPacks(creatorUid));
      setCreating(false);
      setName("");
      setDescription("");
      setPrice("0");
      setFiles([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't submit this pack.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="font-noto text-sm text-muted">
          Create your own sticker pack — earn 70% of every coin purchase once it&apos;s approved.
        </p>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="btn-primary text-sm">
            <Plus className="h-4 w-4" /> New Pack
          </button>
        )}
      </div>

      {creating && (
        <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pack name"
            className="input-base"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
            rows={2}
            className="input-base resize-none"
          />
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Price (coins — 0 for free)
            </label>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input-base w-32"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-syne text-xs font-semibold text-muted">
                Stickers ({files.length}/{MAX_STICKERS}) — PNG with transparency, max 512x512
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_STICKERS}
                className="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" /> Add
              </button>
              <input ref={fileInputRef} type="file" accept="image/png" multiple onChange={handleFilesPicked} className="hidden" />
            </div>
            {files.length > 0 && (
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {files.map((f, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.preview} alt="" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label="Remove"
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={uploading} className="btn-primary text-sm">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for Review"}
            </button>
          </div>
        </div>
      )}

      {myPacks.length === 0 ? (
        <p className="py-8 text-center font-noto text-sm text-muted">You haven&apos;t submitted any sticker packs yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {myPacks.map((pack) => (
            <div key={pack.id} className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-syne text-sm font-semibold text-text">{pack.name}</p>
                <StatusBadge status={pack.status} />
              </div>
              <div className="mb-2 flex gap-1.5">
                {pack.previewUrls.slice(0, 3).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} loading="lazy" src={url} alt="" className="h-12 w-12 rounded-lg bg-bg3 object-contain" />
                ))}
              </div>
              <p className="font-noto text-xs text-muted">
                {pack.stickerCount} stickers · {pack.price === 0 ? "Free" : `${pack.price} coins`} · {pack.downloads} downloads
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
