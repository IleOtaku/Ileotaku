# ÍléOtaku — Setup Guide

Follow these steps in order to get the project running locally against a real Firebase backend.

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Name it (e.g. `ileotaku`) and finish the wizard (Google Analytics is optional).
3. In the project, click the **Web** icon (`</>`) to register a web app and copy the config
   values shown — you'll need them for step 6.

## 3. Enable Authentication methods

In the Firebase Console, go to **Build → Authentication → Sign-in method** and enable:

- **Email/Password**
- **Google**
- **Apple**
- **Twitter (X)** — requires an API key/secret from the [X Developer Portal](https://developer.twitter.com/)

## 4. Create the Firestore database

1. Go to **Build → Firestore Database → Create database**.
2. Choose **Production mode** (the security rules below lock it down properly).
3. Pick a location close to your users.

## 5. Deploy the security rules

Install the Firebase CLI if you don't have it, then log in and deploy `firestore.rules`:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project, keep firestore.rules as the rules file
firebase deploy --only firestore:rules
```

## 6. Fill in `.env.local`

Open `.env.local` in the project root and replace the placeholders with the values from
step 2 (Project Settings → General → Your apps → SDK setup and configuration):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## 7. Run the admin seed script

The seed script creates the ÍléOtaku admin account in both Firebase Auth and Firestore.

1. In the Firebase Console, go to **Project Settings → Service Accounts → Generate new
   private key**. Save the downloaded file as `serviceAccountKey.json` in the project root
   (it's already covered by `.gitignore` — never commit it).
2. Run:

   ```bash
   npm run seed:admin
   ```

3. The script prints the admin credentials to the console when it finishes:

   ```
   Email:    admin@ileotaku.com
   Password: IleOtaku@Admin2025!
   ```

   Sign in with these at `/auth/login` to reach the admin console. **Change this password**
   before using the account anywhere beyond local development.

## 8. Run the dev server

```bash
npm run dev
```

Visit **http://localhost:3000**. Key pages:

- `/` — landing page
- `/auth/login`, `/auth/signup` — authentication
- `/creator` — creator dashboard (sign in first)
- `/creator/[handle]` — public creator profiles
- `/pricing` — plans

## 9. Spotify integration (optional)

Now Playing / Listen Along and the SoundPicker's real search need a Spotify app:

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. In its settings, add a Redirect URI that exactly matches `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI`
   below (`http://localhost:3000/auth/spotify/callback` for local dev) — Spotify rejects the
   OAuth callback outright if this doesn't match character-for-character.
3. Copy the Client ID and Client Secret into `.env.local`:

   ```bash
   NEXT_PUBLIC_SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
   ```

Without these set, "Connect Spotify" in Settings fails gracefully (an error screen, not a
crash) and the SoundPicker's Spotify tab falls back to the app-level search that needs no
per-user connection at all.

## 10. Account auto-deletion sweep

`scripts/check-inactive-accounts.js` warns, then deletes, accounts inactive past their chosen
`inactivityDeleteAfter` threshold. It's a manual script for now — **run it weekly** (a real
Cloud Function scheduled job is planned for Sprint 11):

```bash
node scripts/check-inactive-accounts.js            # live run
node scripts/check-inactive-accounts.js --dry-run  # prints what it would do, changes nothing
```

Needs `serviceAccountKey.json` (same one from step 7). To actually send the warning email, set
`RESEND_API_KEY` or `SENDGRID_API_KEY` in the environment the script runs in — without either,
it logs what it would have sent instead of failing the sweep.

## Pre-Launch

Run `node scripts/wipe-beta-data.js` before public launch. This permanently deletes every beta
tester's account, posts, and platform activity (keeping only the seeded admin account, reset to a
clean baseline) so real users aren't signing up into a database full of test data. See the script's
own header comment for exactly what it does and doesn't touch — it needs `serviceAccountKey.json`
(same one from step 7), and there is no confirmation prompt, so only run it once you mean it.

## Admin credentials (reference)

| Field    | Value                     |
| -------- | ------------------------- |
| Email    | `admin@ileotaku.com`      |
| Password | `IleOtaku@Admin2025!`     |

These are seeded by `npm run seed:admin` (step 7) — they don't exist until you run it against
your own Firebase project.
