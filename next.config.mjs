/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudinary — every user-uploaded image/video (avatars, cover art, feed media, sound
      // artwork) now lives here instead of Firebase Storage. See lib/cloudinary.ts.
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};

export default nextConfig;
