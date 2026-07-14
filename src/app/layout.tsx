import type { Metadata } from "next";
import "./globals.css";
import { LayoutDashboard, Briefcase, BarChart2, Settings, FileText } from "lucide-react";
import Link from 'next/link';
import ThemeProvider from "@/components/ThemeProvider";

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
        <ThemeProvider>
          <div className="app-container">
            <Navigation />

            
            <main className="main-content">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
