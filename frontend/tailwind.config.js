/** @type {import('tailwindcss').Config} */
// Every color is a CSS variable (see index.css), so one class works in both themes.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: v("paper"), // page background
        sheet: v("sheet"), // raised surfaces: lists, cards, inputs
        raise: v("raise"), // hover on a sheet
        ink: v("ink"), // body text
        muted: v("muted"), // secondary text
        faint: v("faint"), // hints and placeholders
        rule: v("rule"), // hairlines
        accent: { DEFAULT: v("accent"), strong: v("accent-strong"), wash: v("accent-wash"), on: v("accent-on") },
        // the alert terminal: dark in both themes
        term: { bg: v("term-bg"), text: v("term-text"), dim: v("term-dim"), line: v("term-line") },
        sev: {
          critical: v("sev-critical"),
          high: v("sev-high"),
          medium: v("sev-medium"),
          low: v("sev-low"),
          none: v("sev-none"),
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: { page: "70rem", prose: "40rem" },
    },
  },
  plugins: [],
};
