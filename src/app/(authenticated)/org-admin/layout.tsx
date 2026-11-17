export default function OrgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ paddingBottom: "3rem" }}>
      {children}
    </div>
  );
}
