import type { Metadata, Viewport } from "next";
import { RESPONSIBLE_NOTICE } from "@fpp/core";
import { Nav } from "@/components/Nav";
import { Toast } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MatchLens — football predictions you can verify", template: "%s · MatchLens" },
  description: "Statistical football predictions with honest probabilities, data-quality indicators and a public, verifiable track record.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111b28" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main>
            {children}
            <p className="footer-note">{RESPONSIBLE_NOTICE}</p>
          </main>
          <Toast />
        </div>
      </body>
    </html>
  );
}
