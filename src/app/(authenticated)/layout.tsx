import { HelpProvider } from "@/contexts/HelpContext";
import TourGuide from "@/components/common/TourGuide";
import HelpPanel from "@/components/common/HelpPanel";
import Navigation from "@/components/Navigation";
import { GlobalAutoApplyDock } from "@/components/GlobalAutoApplyDock";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <HelpProvider>
      <TourGuide />
      <div className="app-container">
        <Navigation />
        <main className="main-content">
          {children}
        </main>
        <HelpPanel />
        <GlobalAutoApplyDock />
      </div>
    </HelpProvider>
  );
}
