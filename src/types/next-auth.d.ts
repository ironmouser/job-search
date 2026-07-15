import NextAuth, { DefaultSession, DefaultUser } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      isOnboarded: boolean
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    isOnboarded: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    isOnboarded: boolean
  }
}
