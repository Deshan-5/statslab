import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Half-step grays interpolated between Tailwind's default neutral
        // stops — used throughout the app for finer-grained text/border
        // contrast than the default 100-unit scale allows.
        neutral: {
          150: "#ebebeb",
          250: "#dbdbdb",
          350: "#bcbcbc",
          450: "#8b8b8b",
          550: "#5e5e5e",
          650: "#484848",
          750: "#333333",
          850: "#1f1f1f",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-source-serif)", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      animation: {
        "soft-pulse": "softPulse 2.4s ease-in-out infinite",
      },
      keyframes: {
        softPulse: {
          "0%, 100%": { opacity: "0.65" },
          "50%":      { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
