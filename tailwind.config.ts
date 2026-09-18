import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  // Beta feedback bug: "bubble styles all look the same" — every one of the 10
  // `.bubble-style-N` rules in globals.css (see the `@layer components` block there) was being
  // silently dropped from the production build. Root cause, confirmed by running `npx
  // tailwindcss` directly and diffing its raw output: Tailwind v3 treats classes declared inside
  // an `@layer` block the same as its own generated utilities for purging purposes — it only
  // keeps a class if the LITERAL, complete string appears somewhere in a content-scanned file.
  // MessagesClient.tsx and BubbleStylePicker.tsx only ever build the class via string
  // interpolation (`` `bubble-style-${bubbleStyleNum}` ``), so the literal strings "bubble-style-1"
  // through "bubble-style-10" never appear anywhere in the scanned source, and Tailwind correctly
  // (by its own rules) concluded they were unused and stripped every one of them — verified by
  // grepping the compiled CSS for each one individually; only the two that happen to be paired
  // with a `.other` compound selector partially survived, everything else was gone outright. The
  // `other` class (from `${!isOwn ? "other" : ""}`) is the same story. Safelisting is the
  // standard, documented fix for any class name Tailwind can't discover via static analysis.
  safelist: [
    "bubble-style-1",
    "bubble-style-2",
    "bubble-style-3",
    "bubble-style-4",
    "bubble-style-5",
    "bubble-style-6",
    "bubble-style-7",
    "bubble-style-8",
    "bubble-style-9",
    "bubble-style-10",
    "other",
    "message-bubble",
  ],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // Beta feedback bug: the cover-style picker's preview swatches (className strings defined
    // in lib/coverStyles.ts, e.g. "from-clay via-bg2 to-green") rendered with no color at all —
    // Tailwind's JIT scanner never saw those literal class strings because lib/ wasn't in this
    // content glob, so it never generated CSS for them. lib/sounds.ts has the same pattern.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0c0a07",
        bg2: "#121009",
        bg3: "#1a1510",
        bg4: "#211c12",
        bg5: "#2a2218",
        clay: "#c4622d",
        clay2: "#e07840",
        gold: "#d4a843",
        gold2: "#f0c96a",
        ivory: "#f5ede0",
        muted: "#7a6a58",
        muted2: "#5a4e40",
        green: "#3d6b4f",
        green2: "#4e8a64",
        text: "#e8ddd0",
        plat: "#9ecfef",
        plat2: "#c8e8f8",
      },
      fontFamily: {
        cinzel: ['"Cinzel Decorative"', "serif"],
        syne: ["Syne", "sans-serif"],
        noto: ['"Noto Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
