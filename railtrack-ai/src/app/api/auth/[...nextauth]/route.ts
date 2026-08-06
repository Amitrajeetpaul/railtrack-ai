/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const authOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === 'google' && account?.id_token) {
        try {
          const res = await fetch(`${FASTAPI_URL}/api/auth/google-verify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ token: account.id_token }),
          });
          if (res.ok) {
            const data = await res.json();
            token.accessToken = data.access_token;
            token.role        = data.user?.role    ?? 'CONTROLLER';
            token.section     = data.user?.section ?? 'NR-42';
            token.railtrackId = data.user?.id;
          }
        } catch (err) {
          console.error('[NextAuth] google-verify failed:', err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken        = token.accessToken;
      if (session.user) {
        session.user.role        = token.role;
        session.user.section     = token.section;
        session.user.railtrackId = token.railtrackId;
      }
      return session;
    },
  },
  pages:   { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 86400 },
  // No hardcoded fallback — a missing NEXTAUTH_SECRET must not silently sign
  // sessions with a known/guessable string. NextAuth itself warns loudly (and
  // in production refuses to sign real sessions) when this is unset; it must
  // not be a top-level throw here since that would fail the build at
  // page-data collection time, not just requests to this (currently unused —
  // login goes through /api/auth/google-verify on the backend, not NextAuth's
  // own signIn()) route. Set NEXTAUTH_SECRET (`openssl rand -base64 32`) in
  // the deployment env before wiring any real flow through this route.
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };