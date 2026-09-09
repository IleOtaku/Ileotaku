import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://ileotaku.vercel.app";
  const staticRoutes = [
    "/",
    "/reader",
    "/explore",
    "/search",
    "/pricing",
    "/feed",
    "/auth/login",
    "/auth/signup",
    "/privacy",
    "/terms",
    "/creator-agreement",
    "/cookies",
    "/about",
    "/help",
    "/contact",
  ];
  return staticRoutes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
