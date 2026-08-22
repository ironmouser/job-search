import { HelpProvider } from "@/contexts/HelpContext";
import { AutoApplyBarProvider } from "@/contexts/AutoApplyBarContext";
import TourGuide from "@/components/common/TourGuide";
import HelpPanel from "@/components/common/HelpPanel";
import Navigation from "@/components/Navigation";
import { GlobalAutoApplyBar } from "@/components/GlobalAutoApplyBar";
import UserSessionGuard from "@/components/UserSessionGuard";
import OrgAdminDock from "@/components/admin/OrgAdminDock";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <HelpProvider>
      <AutoApplyBarProvider>
        <UserSessionGuard />
        <TourGuide />
        <div className="app-container">
          <Navigation />
          <main className="main-content">
            {children}
          </main>
          <HelpPanel />
          <GlobalAutoApplyBar />
          <OrgAdminDock />
        </div>
      </AutoApplyBarProvider>
    </HelpProvider>
  );
}

