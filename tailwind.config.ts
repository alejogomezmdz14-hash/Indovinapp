import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#F2B705",
          "gold-light": "#F5C93A",
          "gold-dark": "#D9A004",
          wine: "#7A1B1B",
          "wine-light": "#9B2C2C",
          "wine-dark": "#5C1414",
          black: "#1A1A1A",
          cream: "#FFF9ED",
          "cream-dark": "#FEF3D6",
        },
      },
      boxShadow: {
        "card": "0 1px 3px rgba(26,26,26,0.06), 0 4px 12px rgba(26,26,26,0.04)",
        "card-hover": "0 4px 16px rgba(26,26,26,0.1), 0 8px 24px rgba(26,26,26,0.06)",
        "btn": "0 2px 0 rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
        "btn-hover": "0 3px 0 rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.1)",
        "btn-active": "0 1px 0 rgba(0,0,0,0.12)",
        "sidebar": "4px 0 24px rgba(26,26,26,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
