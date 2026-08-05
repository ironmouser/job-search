import NextAuth, { DefaultSession, DefaultUser } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      isOnboarded: boolean
      planTier: string
      role: "USER" | "ORGANIZATION_ADMIN" | "SYSTEM_ADMIN"
      subscriptionType: "FREE" | "PREMIUM" | "GROUP"
      organizationId: string | null
      isDisabled: boolean
      orgAccessExpiresAt: Date | null
      /** Expiry of the 7-day Pro trial (null if no trial was ever granted or trial expired) */
      trialEndsAt: Date | null
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    isOnboarded: boolean
    planTier: string
    role: "USER" | "ORGANIZATION_ADMIN" | "SYSTEM_ADMIN"
    subscriptionType: "FREE" | "PREMIUM" | "GROUP"
    organizationId: string | null
    isDisabled: boolean
    orgAccessExpiresAt: Date | null
    trialEndsAt: Date | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    isOnboarded: boolean
    planTier: string
    role: string
    subscriptionType: string
    organizationId: string | null
    isDisabled: boolean
    orgAccessExpiresAt: string | null
    trialEndsAt: string | null
  }
}
