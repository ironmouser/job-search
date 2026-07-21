import PublicNav from "@/components/landing/PublicNav";
import PublicFooter from "@/components/landing/PublicFooter";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="public-layout-container">
      <PublicNav style={{ background: 'transparent' }} />
      <main style={{ flex: 1, background: 'transparent' }}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
