import type { NextAuthConfig } from "next-auth";

export default {
  pages: { signIn: "/signin" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAuthed = !!auth;
      const isAuthRoute = pathname.startsWith("/signin");

      if (!isAuthed && !isAuthRoute) return false;
      if (isAuthed && isAuthRoute) {
        return Response.redirect(new URL("/", request.nextUrl.origin));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "owner" | "editor" | "staff" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as "owner" | "editor" | "staff";
      return session;
    },
  },
} satisfies NextAuthConfig;
