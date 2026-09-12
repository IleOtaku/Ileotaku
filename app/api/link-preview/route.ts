export const dynamic = "force-dynamic";

/**
 * Beta feedback: "Links should be clickable, show the preview and should be formatted to be
 * shorter." Clickable + shortened was already handled client-side (see MentionText.tsx's
 * shortenUrlLabel) — this route is the remaining "show the preview" half: fetches the target
 * page's own HTML and pulls out its Open Graph / plain <title> tags, no third-party unfurl
 * service or API key needed.
 *
 * Basic SSRF guard: only plain http(s) URLs are fetched, and obviously-internal hostnames
 * (localhost, loopback, link-local/private IP literals) are rejected outright. This is a
 * best-effort filter appropriate for a small beta feature, not a hardened proxy — it does not
 * defend against DNS rebinding (a hostname that resolves to a private IP only at fetch time).
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 300_000;

const PRIVATE_HOSTNAME_PATTERN =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1$|fc00:|fd00:|172\.(1[6-9]|2\d|3[01])\.)/i;

function isSafeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (PRIVATE_HOSTNAME_PATTERN.test(url.hostname)) return null;
  return url;
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  const safeUrl = isSafeUrl(target);
  if (!safeUrl) {
    return Response.json({ error: "Unsupported URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(safeUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IleOtakuLinkPreview/1.0; +https://ileotaku.vercel.app)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) {
      return Response.json({ error: "Fetch failed" }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return Response.json({ error: "Not HTML" }, { status: 415 });
    }

    // Read only up to MAX_HTML_BYTES — the <head> we need is always near the top, and a full
    // page body could be arbitrarily large.
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      let received = 0;
      const decoder = new TextDecoder();
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    } else {
      html = await res.text();
    }

    const title =
      extractMeta(html, "og:title") ??
      decodeHtmlEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
    const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
    let image = extractMeta(html, "og:image");
    if (image && !image.startsWith("http")) {
      try {
        image = new URL(image, safeUrl).toString();
      } catch {
        image = null;
      }
    }

    if (!title && !description && !image) {
      return Response.json({ error: "No preview data" }, { status: 404 });
    }

    return Response.json(
      { title: title || null, description: description || null, image: image || null, siteName: safeUrl.hostname },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json({ error: "Couldn't fetch a preview" }, { status: 502 });
  }
}
