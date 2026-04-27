import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || 'planora-temp-secret-replace-me',
  });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Protect these routes — redirect to /login if unauthenticated
  matcher: [
    '/dashboard/:path*',
    '/calendar/:path*',
    '/workspace/:path*',
    '/collaboration/:path*',
    '/notes/:path*',
    '/profile/:path*',
    '/tasks/:path*',
    '/workspaces/:path*',
    '/settings/:path*',
  ],
};
