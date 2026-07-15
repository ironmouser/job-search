import { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: "jwt"
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD
        }
      },
      from: process.env.EMAIL_FROM
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.isOnboarded = (user as any).isOnboarded || false;
        token.planTier = (user as any).planTier || "FREE";
        token.role = (user as any).role || "USER";
      }
      
      if (trigger === "update") {
        if (session?.isOnboarded !== undefined) token.isOnboarded = session.isOnboarded;
        if (session?.planTier !== undefined) token.planTier = session.planTier;
        if (session?.image !== undefined) token.image = session.image;
        if (session?.name !== undefined) token.name = session.name;
        if (session?.role !== undefined) token.role = session.role;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).isOnboarded = token.isOnboarded as boolean;
        (session.user as any).planTier = token.planTier as string || "FREE";
        (session.user as any).role = token.role as string || "USER";
        if (token.image) session.user.image = token.image as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    }
  }
}
