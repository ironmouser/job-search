import { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { evaluateAccountCollision } from "@/lib/anti-abuse/detector"

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
    CredentialsProvider({
      name: "Test Account",
      credentials: {},
      async authorize() {
        let user = await prisma.user.findUnique({ where: { email: "test@example.com" } });
        if (!user) {
          user = await prisma.user.create({
            data: { email: "test@example.com", name: "Test User" }
          });
        }
        return user as any;
      }
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user?.email) {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { accounts: true }
          });

          if (existingUser) {
            // Block disabled organization users from signing in
            if ((existingUser as any).isDisabled) {
              return false;
            }

            const hasGoogleAccount = existingUser.accounts.some(a => a.provider === 'google');
            if (!hasGoogleAccount) {
              await prisma.account.create({
                data: {
                  userId: existingUser.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token,
                }
              });
            }
            user.id = existingUser.id;
          }
        } catch (e) {
          console.error("Error linking Google account in signIn callback:", e);
        }
      }
      if (user?.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { trialEndsAt: true, planTier: true, isTrialDeferred: true }
          });

          if (dbUser && !dbUser.trialEndsAt && dbUser.planTier === 'FREE') {
            // Evaluate account collision (email normalization & disposable domain check)
            const collisionResult = await evaluateAccountCollision(user.id, user.email || '');

            // Only grant 7-day Pro trial if no identity collision is detected
            if (!collisionResult.isCollision) {
              await prisma.user.update({
                where: { id: user.id },
                data: { trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
              });
            }
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          });
        } catch (e) {
          console.error("Error updating user on signIn:", e);
        }
      }
      return true;

    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.isOnboarded = (user as any).isOnboarded || false;
        token.planTier = (user as any).planTier || "FREE";
        token.role = (user as any).role || "USER";
        token.subscriptionType = (user as any).subscriptionType || "FREE";
        token.organizationId = (user as any).organizationId || null;
        token.isDisabled = (user as any).isDisabled || false;
        token.isTrialDeferred = (user as any).isTrialDeferred || false;
      } else if (token.id) {
        // Refresh org-related fields and verify user still exists
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            id: true,
            isOnboarded: true,
            planTier: true,
            role: true,
            subscriptionType: true,
            organizationId: true,
            isDisabled: true,
            orgAccessExpiresAt: true,
            trialEndsAt: true,
            isTrialDeferred: true,
            trialDeferralReason: true,
          }
        });
        if (!dbUser) {
          // User was deleted from DB; invalidate token
          token.id = "";
          return token;
        }
        // Invalidate session for disabled users
        if (dbUser.isDisabled) {
          token.id = "";
          return token;
        }
        token.isOnboarded = dbUser.isOnboarded;
        token.planTier = dbUser.planTier;
        token.role = dbUser.role;
        token.subscriptionType = dbUser.subscriptionType || "FREE";
        token.organizationId = dbUser.organizationId;
        token.isDisabled = dbUser.isDisabled || false;
        token.orgAccessExpiresAt = dbUser.orgAccessExpiresAt?.toISOString() || null;
        token.trialEndsAt = dbUser.trialEndsAt?.toISOString() || null;
        token.isTrialDeferred = dbUser.isTrialDeferred || false;
        token.trialDeferralReason = dbUser.trialDeferralReason || null;
      }
      
      if (trigger === "update") {
        if (session?.isOnboarded !== undefined) token.isOnboarded = session.isOnboarded;
        if (session?.planTier !== undefined) token.planTier = session.planTier;
        if (session?.image !== undefined) token.image = session.image;
        if (session?.name !== undefined) token.name = session.name;
        if (session?.role !== undefined) token.role = session.role;
        if (session?.subscriptionType !== undefined) token.subscriptionType = session.subscriptionType;
        if (session?.organizationId !== undefined) token.organizationId = session.organizationId;
        if (session?.isTrialDeferred !== undefined) token.isTrialDeferred = session.isTrialDeferred;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (!token.id) {
        // Token has no id (user deleted/disabled) — return a session with no user so the client
        // treats it as unauthenticated without crashing on Object.keys(null).
        return { ...session, user: undefined, expires: new Date(0).toISOString() } as any;
      }
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).isOnboarded = token.isOnboarded as boolean;
        (session.user as any).planTier = token.planTier as string || "FREE";
        (session.user as any).role = token.role as string || "USER";
        let subType = token.subscriptionType as string || "FREE";
        const expiresAt = token.orgAccessExpiresAt ? new Date(token.orgAccessExpiresAt as string) : null;
        if (subType === "GROUP" && expiresAt && expiresAt < new Date()) {
          subType = "FREE";
        }
        
        (session.user as any).subscriptionType = subType;
        (session.user as any).organizationId = token.organizationId as string | null;
        (session.user as any).isDisabled = token.isDisabled as boolean || false;
        (session.user as any).orgAccessExpiresAt = expiresAt;
        (session.user as any).trialEndsAt = token.trialEndsAt ? new Date(token.trialEndsAt as string) : null;
        (session.user as any).isTrialDeferred = token.isTrialDeferred as boolean || false;
        (session.user as any).trialDeferralReason = token.trialDeferralReason as string | null;
        if (token.image) session.user.image = token.image as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    }
  }
};

