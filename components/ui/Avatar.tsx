"use client";

import { useState } from "react";
import { cn, initials, stringToColor } from "@/lib/utils";

export interface AvatarProps {
  /** Used (over displayName) to seed the fallback color when there's no photo, so the same
   * person's initials circle is always the same color everywhere, even across a rename. */
  uid?: string;
  photoURL?: string;
  displayName?: string;
  /** Pixel size of both the image and the fallback circle. */
  size?: number;
  className?: string;
}

/** The one avatar this app renders anywhere a user/creator's picture shows up — a real photo
 * when they have one, else initials on a color generated from their uid (falling back to their
 * name, then a fixed "user" seed) so it's stable rather than random. Centralizing this ends the
 * drift of a dozen near-identical photoURL-or-initials blocks (Navbar, DM lists, comments, feed
 * cards, search results, admin tables, ...) each handling the no-photo case slightly differently.
 *
 * Universal profile-picture fix: a Google OAuth photoURL (lh3.googleusercontent.com) 404s/errors
 * without `referrerPolicy="no-referrer"` — Google's image CDN rejects the request entirely when
 * it sees a Referer header from a third-party origin, which every browser sends by default.
 * `crossOrigin="anonymous"` similarly avoids CORS failures on other externally-hosted photos
 * (this app's own Cloudinary uploads don't need it, but a photoURL can also be a raw Google/other
 * OAuth url that predates any Cloudinary migration). Explicit `width`/`height` in `style` (not
 * just the width/height attributes, which Tailwind's own classes can override) guarantees the
 * rendered box is actually `size` pixels regardless of what className brings in.
 *
 * A broken/404ing photoURL falls back to the initials circle (via `imgError` below) rather than
 * just hiding the <img> on error and leaving a blank circle-shaped hole — the same visual outcome
 * as never having had a photoURL at all, which is what a viewer actually wants to see. */
export function Avatar({ uid, photoURL, displayName, size = 36, className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const color = stringToColor(uid || displayName || "user");
  const text = initials(displayName || "U");

  if (photoURL && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt={displayName || ""}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        className={cn("rounded-full object-cover shrink-0", className)}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}
    >
      {text}
    </div>
  );
}
