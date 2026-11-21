import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        field: "#f5f7f2",
        line: "#d8ded4",
        teal: "#16b59e",
        aqua: "#72fff0",
        mint: "#e8fbf7",
        moss: "#3f6f52",
        leaf: "#76a66d",
        coral: "#dc6f58",
        gold: "#d0a640",
        sky: "#4f8ca3"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23,32,27,0.08)"
      }
    }
  },
  plugins: []
};

export default config;
