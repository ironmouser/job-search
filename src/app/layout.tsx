import type { Metadata } from "next";
import "./globals.css";
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText } from "lucide-react";
import Link from 'next/link';
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import { HelpProvider } from "@/contexts/HelpContext";
import TourGuide from "@/components/common/TourGuide";
import HelpPanel from "@/components/common/HelpPanel";

import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "AI Job Search Agent",
  description: "Your personal AI job search assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="light-theme">
        <AuthProvider>
          <ThemeProvider>
            <HelpProvider>
              <TourGuide />
              <div className="app-container">
                <Navigation />
                <main className="main-content">
                  {children}
                </main>
                <HelpPanel />
              </div>
            </HelpProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
