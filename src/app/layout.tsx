import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PropFlow — rentals, homes for sale and resale",
    template: "%s · PropFlow",
  },
  description:
    "Listings and enquiries for a small real-estate brokerage, with a private lead-to-site-visit workspace for the team.",
  robots: {
    // The CRM must never be indexed; the public site is the only surface we
    // want crawled.
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, noarchive: true },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a1826",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}