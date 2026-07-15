import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "4rem", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "3rem" }}>
        <h1 className="page-title">Profile & Settings</h1>
        <p className="page-subtitle">Manage your account information and billing</p>
      </div>

      <ProfileForm 
        initialName={user.name || ""} 
        initialImage={user.image || ""} 
        planTier={user.planTier}
        stripeCustomerId={user.stripeCustomerId}
        email={user.email}
      />
    </div>
  );
}
