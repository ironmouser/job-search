import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import GoogleAnalytics from "@/components/GoogleAnalytics";

const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.jobagenthq.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AI Job Search Agent",
  description: "Your personal AI job search assistant.",
  openGraph: {
    title: "AI Job Search Agent",
    description: "Your personal AI job search assistant.",
    url: "/",
    siteName: "Job Agent",
    type: "website",
    images: [
      {
        url: "/full-logo.png",
        width: 1200,
        height: 630,
        alt: "Job Agent Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Job Search Agent",
    description: "Your personal AI job search assistant.",
    images: ["/full-logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "Job Agent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="light-theme" suppressHydrationWarning>
        <GoogleAnalytics />
        <AuthProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
