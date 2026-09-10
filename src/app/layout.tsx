import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Gamma";
const description =
  "Pick a ticker and a budget. Gamma reads dealer positioning, vol and liquidity, then ranks the debit spreads and calls worth taking.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://gamma-scout.vercel.app",
  ),
  title: { default: title, template: "%s | Gamma" },
  description,
  applicationName: title,
  appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: title,
    title,
    description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07080b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
