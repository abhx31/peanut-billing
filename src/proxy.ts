import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy(() => {
  return;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
