# Deploying ÍléOtaku to Vercel

A complete walkthrough for taking this repo from your machine to a live, shareable
`ileotaku.vercel.app` URL.

## Prerequisites

- Node 18 or later
- A configured Firebase project (see `SETUP.md` steps 2-7 if you haven't done this yet —
  Authentication enabled, Firestore created, security rules deployed, admin account seeded)
- A Cloudinary account (cloud name + an unsigned upload preset)
- A Paystack account (test keys are fine for the beta; switch to live keys before public launch)

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/ileotaku.git
git push -u origin main
```

(Skip `git init`/`git add`/`git commit` if this is already a git repo with commits — just add the
remote and push.)

## Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub sign-in is easiest).
2. Click **New Project**.
3. **Import** the `ileotaku` repository from GitHub.
4. Vercel auto-detects Next.js — leave the framework preset as-is. `vercel.json` in this repo
   already sets the build/dev/install commands and the `lhr1` (London) region, so you shouldn't
   need to change anything in the import screen itself.

## Step 3: Environment variables

Before deploying, add every one of these in **Vercel → your project → Settings → Environment
Variables** (values below are copied from `.env.example` — see that file for the full comments).
Apply each to Production, Preview, and Development unless noted otherwise.

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (`<project-id>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket (kept for reference; uploads actually go through Cloudinary) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Your unsigned upload preset name |
| `CLOUDINARY_API_KEY` | Cloudinary API key — server-only, used to sign delete requests |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret — server-only, never exposed to the browser |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack public key (`pk_test_...` for beta, `pk_live_...` for public launch) |
| `PAYSTACK_SECRET_KEY` | Paystack secret key — server-only |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret — server-only |
| `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` | Must exactly match a Redirect URI registered in the Spotify Developer Dashboard — use `https://ileotaku.vercel.app/auth/spotify/callback` in production |
| `NEXT_PUBLIC_PROPELLERADS_PUBLISHER_ID` | PropellerAds publisher ID — placeholder text is fine until you have a real PropellerAds account; ads simply don't render until it's set |
| `NEXT_PUBLIC_PROPELLERADS_ZONE_BETWEEN_CHAPTERS` | PropellerAds zone ID for the reader's between-chapters ad slot — placeholder ok |
| `NEXT_PUBLIC_PROPELLERADS_ZONE_PROFILE` | PropellerAds zone ID for the profile-sidebar ad slot — placeholder ok |
| `NEXT_PUBLIC_APP_URL` | `https://ileotaku.vercel.app` — used for SEO metadata and the sitemap |
| `NEXT_TELEMETRY_DISABLED` | `1` — disables Next.js telemetry |

## Step 4: Deploy

Click **Deploy**. Vercel builds and deploys automatically; from then on, every push to your main
branch triggers a new production deploy (and every other branch/PR gets its own preview URL).

## Step 5: Post-deploy checklist

Once the deploy finishes, work through this list against the real `ileotaku.vercel.app` URL:

- [ ] Visit `ileotaku.vercel.app` — confirm the landing page loads
- [ ] Sign in with `admin@ileotaku.com` — confirm the admin dashboard works
- [ ] Browse manga — confirm MangaDex content loads
- [ ] Test a Paystack payment (use a [Paystack test card](https://paystack.com/docs/payments/test-payments/) while on test keys)
- [ ] Confirm Cloudinary uploads work (try a profile photo or cover image)
- [ ] Submit a beta feedback item via the floating Feedback button, and confirm it shows up in
      the admin dashboard's Feedback tab

## Step 6: Add the domain to Firebase Auth

Firebase blocks sign-in from origins it doesn't recognize. Go to
**console.firebase.google.com → your project → Authentication → Settings → Authorized domains**
and add `ileotaku.vercel.app`.

## Step 7: Add the redirect URI to Spotify

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), open your app's
settings and add `https://ileotaku.vercel.app/auth/spotify/callback` to **Redirect URIs** — it
must match `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` exactly, including the scheme.

## Step 8: Share the URL with beta testers

Once the checklist above passes, `ileotaku.vercel.app` is ready to hand out. The floating Beta
Feedback button (see `components/layout/BetaFeedback.tsx`) auto-hides after October 31, 2025 —
no action needed to turn it off later.

## Connecting a custom domain (when you're ready)

**Vercel → your project → Settings → Domains → Add**, then follow Vercel's DNS instructions
(usually a CNAME or A record at your registrar). Once it's verified, also add the new domain to
Firebase Auth's authorized domains (Step 6) and Spotify's redirect URIs (Step 7) — both are keyed
off the exact origin, so a domain change needs both updated too, and `NEXT_PUBLIC_APP_URL` should
be updated to match for SEO metadata and the sitemap.

## Before public launch

Run the beta data wipe once you're ready to open the platform to real users — see
`scripts/wipe-beta-data.js` and `SETUP.md`'s Pre-Launch section:

```bash
node scripts/wipe-beta-data.js
```

This permanently deletes every beta tester's account, posts, and platform activity, keeping only
the seeded admin account (reset to a clean baseline). There's no confirmation prompt, so only run
it once. Also switch `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`/`PAYSTACK_SECRET_KEY` to live keys in
Vercel's environment variables before real payments should go through.
