import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from 'next/navigation';
import WelcomeChoiceFlow from '@/components/WelcomeChoiceFlow';

export const revalidate = 0;

export default async function WelcomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (session.user.role === 'ORGANIZATION_ADMIN') {
    redirect('/org-admin');
  }

  return (
    <WelcomeChoiceFlow userName={session.user.name} />
  );
}
