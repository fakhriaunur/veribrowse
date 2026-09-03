import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VeriBrowse — Safer Browsing via WebMCP",
  description:
    "Score any website and verify claims with citations. Elderly-friendly summary plus nerd verbose audit, powered by WebMCP.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
