import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VeriBrowse — Safer Browsing via WebMCP",
  description:
    "Score any website and verify claims with citations. Elderly-friendly summary plus nerd verbose audit, powered by WebMCP.",
};

// Blocking pre-paint script: applies the stored theme (or the OS
// prefers-color-scheme on first visit) before first render so there is no
// flash of the wrong theme. Light is the default-safe fallback.
const THEME_SCRIPT = `(function(){try{var k="veribrowse:theme:v1";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-coal dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
