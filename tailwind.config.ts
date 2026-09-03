import type { Config } from "tailwindcss";
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safe: "#16a34a",
        caution: "#ca8a04",
        risky: "#dc2626",
      },
    },
  },
  plugins: [],
} satisfies Config;
