import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_SHORT_NAME, SITE_DESCRIPTION, BRAND_BG } from "@/lib/site";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headings reuse Geist for the clean, consistent Vercel look.
const geistHeading = Geist({
  variable: "--font-heading",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_SHORT_NAME}`,
  },
  applicationName: SITE_SHORT_NAME,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  // Private financial tool — keep it out of every search index.
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_AU",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_BG,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistHeading.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Set the saved theme on <html> before first paint — no flash for light-theme users. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
