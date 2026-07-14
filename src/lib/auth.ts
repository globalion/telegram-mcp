import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Facebook from "next-auth/providers/facebook";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";

// Providers are added conditionally — a provider whose env vars aren't set
// won't appear in the sign-in list. This keeps deploys without GitHub/
// Facebook/Microsoft creds from breaking at boot.
//
// allowDangerousEmailAccountLinking: when the OAuth account's verified email
// matches an existing User with a different provider, link to the existing
// row instead of failing OAuthAccountNotLinked. Safe for trusted providers
// (all four verify their own emails); required so a user who signed in with
// Google can later sign in with GitHub and land on the SAME account.

const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.GITHUB_CLIENT_ID) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.FACEBOOK_CLIENT_ID) {
  providers.push(
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      // "common" issuer works for both Microsoft work/school AND personal
      // (Outlook.com / Hotmail / Live.com) accounts in the same app.
      issuer:
        process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
        "https://login.microsoftonline.com/common/v2.0",
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const enabledProviders = providers.map((p) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p as any).id ?? (typeof p === "function" ? p.name?.toLowerCase() : "unknown"),
);

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: "jwt" },
  providers,
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
