/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F3F4F1", // page background: cool off-white
        sheet: "#FBFBF9", // raised surfaces (lists, forms)
        ink: "#14171F", // body text
        muted: "#5D6470", // secondary text
        faint: "#8E949D", // hints and placeholders
        rule: "#DADDD6", // hairlines
        teal: { DEFAULT: "#0F6E6E", dark: "#0A5454", wash: "#E3EFEC" },
        // the pager: the one loud element on the site
        pager: { body: "#23272E", lcd: "#BCC9AE", text: "#1F2A1A", dim: "#5E6B52" },
        sev: {
          critical: "#C93C3C",
          high: "#C2611C",
          medium: "#B7791F",
          low: "#2F855A",
          none: "#8E949D",
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        lcd: ['"VT323"', "ui-monospace", "monospace"],
      },
      maxWidth: { page: "68rem", prose: "40rem" },
    },
  },
  plugins: [],
};
