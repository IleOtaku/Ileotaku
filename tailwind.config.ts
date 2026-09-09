import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
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
