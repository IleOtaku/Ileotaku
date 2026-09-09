"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { addToReadingList } from "@/lib/firestore";

export interface AddToLibraryButtonProps {
  mangaId: string;
}

/** Saves a series to the signed-in user's readingList in Firestore; prompts sign-in otherwise. */
export default function AddToLibraryButton({ mangaId }: AddToLibraryButtonProps) {
  const { user, profile } = useAuth();
  const [added, setAdded] = useState(false);
  const [saving, setSaving] = useState(false);

  const alreadyInLibrary = added || profile?.readingList?.includes(mangaId) === true;

  async function handleClick() {
    if (!user) return;
    setSaving(true);
    try {
      await addToReadingList(user.uid, mangaId);
      setAdded(true);
      toast.success("Added to your library!");
    } catch {
      toast.error("Couldn't add this to your library. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <Link href="/auth/login" className="btn-ghost">
        <BookmarkPlus className="h-4 w-4" /> Sign in to save
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} disabled={saving || alreadyInLibrary} className="btn-ghost">
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : alreadyInLibrary ? (
        <>
          <BookmarkCheck className="h-4 w-4" /> In Library
        </>
      ) : (
        <>
          <BookmarkPlus className="h-4 w-4" /> Add to Library
        </>
      )}
    </button>
  );
}
