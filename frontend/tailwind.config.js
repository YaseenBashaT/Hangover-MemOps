/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        panel: "#111827",
        panel2: "#0f172a",
        edge: "#1f2937",
        sev: {
          critical: "#ef4444",
          high: "#f97316",
          medium: "#eab308",
          low: "#22c55e",
          none: "#6b7280",
        },
        brand: "#6366f1",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
