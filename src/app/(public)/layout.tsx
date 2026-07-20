import PublicNav from "@/components/landing/PublicNav";
import PublicFooter from "@/components/landing/PublicFooter";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundImage: 'url(/background.png)',
        backgroundSize: 'auto',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'top right'
      }}
    >
      <PublicNav style={{ background: 'transparent' }} />
      <main style={{ flex: 1, background: 'transparent' }}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
