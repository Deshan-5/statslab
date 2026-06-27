import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { upsertProfile } from "./db";

// The dev-bypass provider is ONLY registered outside of production.
// In production this array is empty, so the sign-in page never offers it.
const devProviders =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true"
    ? [
        CredentialsProvider({
          id: "credentials",
          name: "Developer Bypass",
          credentials: {
            email: { label: "Email", type: "email" },
            name: { label: "Name", type: "text" },
          },
          async authorize(credentials) {
            return {
              id: "dev-user",
              name: credentials?.name || "Developer",
              email: credentials?.email || "developer@example.com",
              image: null,
            };
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
    ...devProviders,
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user }) {
      try {
        // fire-and-forget; never block sign-in on a profile write
        await upsertProfile({
          id: user?.id ?? null,
          email: user?.email ?? null,
          name: user?.name ?? null,
          image: user?.image ?? null,
        });
      } catch {
        /* ignore */
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};
