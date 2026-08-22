import OrgAdminDock from "@/components/admin/OrgAdminDock";

export default function OrgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ paddingBottom: "5.5rem" }}>
      {children}
      <OrgAdminDock />
    </div>
  );
}
