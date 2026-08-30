import { AuthOptions, User } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { parseDeviceType } from "@/lib/device-detection"
import { evaluateAccountCollision } from "@/lib/anti-abuse/detector"

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma) as unknown as AuthOptions["adapter"],
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 15 * 60, // 15 minutes
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
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
    ...(process.env.NODE_ENV === "development"
      ? [
        CredentialsProvider({
          name: "Test Account",
          credentials: {
            reset: { label: "Reset", type: "text" }
          },
          async authorize() {
            try {
              let user = await prisma.user.findUnique({ where: { email: "test@example.com" } });
              if (user) {
                // Reset user state for a fresh onboarding experience
                await prisma.user.update({
                  where: { id: user.id },
                  data: { isOnboarded: false, planTier: "FREE" }
                });
                await Promise.allSettled([
                  prisma.userPreferences.deleteMany({ where: { userId: user.id } }),
                  prisma.userJob.deleteMany({ where: { userId: user.id } }),
                  prisma.opportunityScore.deleteMany({ where: { userId: user.id } }),
                  prisma.applicationAsset.deleteMany({ where: { userId: user.id } }),
                  prisma.jobFeedback.deleteMany({ where: { userId: user.id } }),
                  prisma.appFeedback.deleteMany({ where: { userId: user.id } }),
                ]);
              } else {
                user = await prisma.user.create({
                  data: {
                    email: "test@example.com",
                    name: "Test User",
                    isOnboarded: false,
                    planTier: "FREE",
                  }
                });
              }
              return user as unknown as User;
            } catch (e) {
              console.error("Error with test user, attempting safe upsert fallback:", e);
              try {
                const user = await prisma.user.upsert({
                  where: { email: "test@example.com" },
                  update: { isOnboarded: false },
                  create: {
                    email: "test@example.com",
                    name: "Test User",
                    isOnboarded: false,
                    planTier: "FREE",
                  }
                });
                return user as unknown as User;
              } catch (fallbackErr) {
                console.error("DB unavailable for Test Account:", fallbackErr);
                return { id: "test-user-dev-id", email: "test@example.com", name: "Test User", isOnboarded: false, planTier: "PRO", role: "USER" } as unknown as User;
              }
            }
          }
        })
      ]
      : []),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url;
      } catch {
        // Invalid URL
      }
      return baseUrl;
    },
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user?.email) {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { accounts: true }
          });

          if (existingUser) {
            // Block disabled organization users from signing in
            if (existingUser.isDisabled) {
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
          let userAgent = '';
          try {
            const reqHeaders = await headers();
            userAgent = reqHeaders.get('user-agent') || '';
          } catch {
            // headers() might not be available in certain environments
          }
          const detectedDevice = parseDeviceType(userAgent);

          let dbUser: { trialEndsAt: Date | null; planTier: string; isTrialDeferred: boolean; regDeviceType?: string | null } | null = null;
          try {
            dbUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { trialEndsAt: true, planTier: true, isTrialDeferred: true, regDeviceType: true }
            });
          } catch {
            dbUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { trialEndsAt: true, planTier: true, isTrialDeferred: true }
            });
          }

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

          try {
            const updateData: {
              lastLoginAt: Date;
              deviceLastUsed: string;
              lastUserAgent: string | null;
              regDeviceType?: string;
            } = {
              lastLoginAt: new Date(),
              deviceLastUsed: detectedDevice,
              lastUserAgent: userAgent ? userAgent.slice(0, 500) : null,
            };
            if (dbUser && !dbUser.regDeviceType) {
              updateData.regDeviceType = detectedDevice;
            }

            await prisma.user.update({
              where: { id: user.id },
              data: updateData
            });
          } catch {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() }
            });
          }
        } catch (e) {
          console.error("Error updating user on signIn:", e);
        }
      }
      return true;

    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
      }
      if (token.id) {
        try {
          // Refresh org/plan/subscription fields directly from DB to prevent stale session tiers
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
            // In dev mode, automatically self-heal test user sessions so they link to the database
            if (process.env.NODE_ENV === "development" && (token.id === "test-user-dev-id" || token.email === "test@example.com")) {
              try {
                const testUser = await prisma.user.upsert({
                  where: { email: "test@example.com" },
                  update: {},
                  create: {
                    email: "test@example.com",
                    name: "Test User",
                    isOnboarded: false,
                    planTier: "FREE",
                  }
                });
                token.id = testUser.id;
                token.isOnboarded = testUser.isOnboarded;
                token.planTier = testUser.planTier;
                token.role = testUser.role;
                return token;
              } catch (e) {
                console.error("Failed to self-heal test user in jwt callback:", e);
              }
            }

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
        } catch (e) {
          console.error("Database connection error in jwt callback:", e);
        }
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
        return { ...session, user: undefined, expires: new Date(0).toISOString() } as unknown as typeof session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isOnboarded = token.isOnboarded;
        session.user.planTier = token.planTier || "FREE";
        session.user.role = (token.role as "USER" | "ORGANIZATION_ADMIN" | "SYSTEM_ADMIN") || "USER";
        let subType = token.subscriptionType || "FREE";
        const expiresAt = token.orgAccessExpiresAt ? new Date(token.orgAccessExpiresAt) : null;
        if (subType === "GROUP" && expiresAt && expiresAt < new Date()) {
          subType = "FREE";
        }

        session.user.subscriptionType = subType as "FREE" | "PREMIUM" | "GROUP";
        session.user.organizationId = token.organizationId;
        session.user.isDisabled = token.isDisabled || false;
        session.user.orgAccessExpiresAt = expiresAt;
        session.user.trialEndsAt = token.trialEndsAt ? new Date(token.trialEndsAt) : null;
        session.user.isTrialDeferred = token.isTrialDeferred || false;
        session.user.trialDeferralReason = token.trialDeferralReason || null;
        if (token.image) session.user.image = token.image as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    }
  }
};

